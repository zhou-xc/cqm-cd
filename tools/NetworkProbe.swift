import Foundation

@main
struct NetworkProbe {
    static func main() async {
        let url = URL(string: "https://ycx.cqmetro.cn/app-h5/msx-metro-pis/")!
        for tls12 in [false, true] {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.timeoutIntervalForRequest = 15
            configuration.timeoutIntervalForResource = 20
            if tls12 { configuration.tlsMaximumSupportedProtocolVersion = .TLSv12 }
            let session = URLSession(configuration: configuration)
            do {
                let (data, response) = try await session.data(from: url)
                print("NATIVE \(tls12 ? "TLS1.2" : "DEFAULT"): HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0), \(data.count) bytes")
            } catch {
                let error = error as NSError
                print("NATIVE \(tls12 ? "TLS1.2" : "DEFAULT"): \(error.domain) \(error.code) \(error.localizedDescription)")
            }
            session.invalidateAndCancel()
        }
    }
}
