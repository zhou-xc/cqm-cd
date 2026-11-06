import Foundation
import CryptoKit
import Security
import CommonCrypto

enum MetroError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

/// Public, anonymous H5 protocol observed on 2026-11-06. No user credentials.
struct MetroAPI {
    static let baseURL = "https://ycx.cqmetro.cn"
    static let appID = "A500120190100001"
    static let publicKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCIEYEEzUqcWR7hf479yGN7WRjv2Tpxm0gcXVH1JyNdIGoQnsyC8DFCtANIDrhXYq7n587QN+dElOKB4SAhlF6ApGvE/gHocxfzyu6X67xB2aCE7E7LPuNrHX5xiUfsRqV/ajYv09bXQj+OMIPRAy1TZAkokMXjuwVe09AqWZPK9wIDAQAB"

    func arrivals(for station: StationChoice) async throws -> ArrivalSnapshot {
        let response: APISchedule = try await post("/bas/smartstation/v1/bas/schedule/station", body: [
            "station_no": station.stationID, "city_id": "5000", "service_id": "01"
        ])
        guard let line = response.lines.first(where: { $0.line_no == station.lineID })
                ?? response.lines.first(where: { $0.line_name == station.lineName }) else {
            throw MetroError.message("接口暂未返回这条线路的到站数据")
        }
        let now = Date()
        return ArrivalSnapshot(stationID: station.stationID, lineID: station.lineID, fetchedAt: now,
                               up: ArrivalNormalizer.normalize(line.up ?? [], now: now),
                               down: ArrivalNormalizer.normalize(line.down ?? [], now: now))
    }

    func post<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
        let bodyData = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes])
        let bodyString = String(decoding: bodyData, as: UTF8.self)
        let timestamp = String(Int64(Date().timeIntervalSince1970 * 1000))
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "yyyyMMddHHmm"
        let sequence = formatter.string(from: Date()) + String(UInt64.random(in: 1_000_000_000...9_999_999_999))
        let digest = Self.digest(body: bodyString, nonce: nonce, sequence: sequence, timestamp: timestamp)
        let signature = try Self.encryptDigest(digest)
        var request = URLRequest(url: URL(string: Self.baseURL + path)!)
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let headers = ["Content-Type": "application/json;charset=utf-8", "Accept": "application/json",
                       "appid": Self.appID, "cityId": "5000", "deviceType": "1", "version": "0400",
                       "timestamp": timestamp, "sequence": sequence, "nonce": nonce, "signature": signature,
                       "decrypt-body": "", "Referer": Self.baseURL + "/app-h5/msx-metro-pis/"]
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        let (raw, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw MetroError.message("到站服务暂时无法连接，请稍后刷新")
        }
        let data = http.value(forHTTPHeaderField: "decrypt-body")?.lowercased() == "true"
            ? try Self.decrypt(raw) : raw
        let envelope: APIEnvelope<T>
        do { envelope = try JSONDecoder().decode(APIEnvelope<T>.self, from: data) }
        catch { throw MetroError.message("到站接口格式发生变化，暂时无法读取") }
        guard envelope.success, let value = envelope.result else {
            throw MetroError.message(envelope.errmsg ?? "暂时没有可用的到站数据")
        }
        return value
    }

    static func digest(body: String, nonce: String, sequence: String, timestamp: String) -> String {
        let message = "appid=\(appID)&message=\(body)&nonce=\(nonce)&sequence=\(sequence)&timestamp=\(timestamp)&version=0400"
        return SHA256.hash(data: Data(message.utf8)).map { String(format: "%02X", $0) }.joined()
    }

    static func encryptDigest(_ digest: String) throws -> String {
        guard let spki = Data(base64Encoded: publicKey) else { throw MetroError.message("接口公钥格式错误") }
        let der = try rsaPKCS1(from: spki)
        var error: Unmanaged<CFError>?
        let attributes: [CFString: Any] = [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic]
        guard let key = SecKeyCreateWithData(der as CFData, attributes as CFDictionary, &error),
              let encrypted = SecKeyCreateEncryptedData(key, .rsaEncryptionPKCS1, Data(digest.utf8) as CFData, &error) else {
            throw MetroError.message("无法生成接口请求签名")
        }
        return (encrypted as Data).base64EncodedString()
    }

    /// Strip the SubjectPublicKeyInfo wrapper, leaving the RSA PKCS#1 key for Security.framework.
    static func rsaPKCS1(from data: Data) throws -> Data {
        let bytes = [UInt8](data)
        var index = 0
        func element(_ expectedTag: UInt8) throws -> Range<Int> {
            guard index + 2 <= bytes.count, bytes[index] == expectedTag else { throw MetroError.message("公钥 DER 无效") }
            index += 1
            var length = Int(bytes[index]); index += 1
            if length & 0x80 != 0 {
                let count = length & 0x7f
                guard count > 0, count <= 4, index + count <= bytes.count else { throw MetroError.message("公钥长度无效") }
                length = 0
                for _ in 0..<count { length = (length << 8) | Int(bytes[index]); index += 1 }
            }
            guard index + length <= bytes.count else { throw MetroError.message("公钥内容不完整") }
            let range = index..<(index + length)
            index += length
            return range
        }
        let sequence = try element(0x30)
        index = sequence.lowerBound
        _ = try element(0x30)
        let bitString = try element(0x03)
        guard !bitString.isEmpty, bytes[bitString.lowerBound] == 0 else { throw MetroError.message("公钥位串无效") }
        return Data(bytes[(bitString.lowerBound + 1)..<bitString.upperBound])
    }

    static func decrypt(_ raw: Data) throws -> Data {
        let hex = String(decoding: raw, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard hex.count % 2 == 0, !hex.isEmpty else { throw MetroError.message("到站响应加密格式错误") }
        var cipher = [UInt8]()
        var position = hex.startIndex
        while position < hex.endIndex {
            let next = hex.index(position, offsetBy: 2)
            guard let byte = UInt8(hex[position..<next], radix: 16) else { throw MetroError.message("到站响应不是有效十六进制") }
            cipher.append(byte); position = next
        }
        let key = Array(publicKey.prefix(16).utf8)
        let capacity = cipher.count + kCCBlockSizeAES128
        var output = [UInt8](repeating: 0, count: capacity)
        var length = 0
        let status = key.withUnsafeBytes { keyBytes in
            cipher.withUnsafeBytes { cipherBytes in
                output.withUnsafeMutableBytes { outputBytes in
                    CCCrypt(CCOperation(kCCDecrypt), CCAlgorithm(kCCAlgorithmAES),
                            CCOptions(kCCOptionPKCS7Padding | kCCOptionECBMode),
                            keyBytes.baseAddress, key.count, nil,
                            cipherBytes.baseAddress, cipher.count, outputBytes.baseAddress, capacity, &length)
                }
            }
        }
        guard status == kCCSuccess else { throw MetroError.message("无法解密到站响应") }
        return Data(output.prefix(length))
    }
}
