import XCTest
import Security
@testable import MetroMinutes

final class MetroMinutesTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(bundle.url(forResource: name, withExtension: "json"))
        return try Data(contentsOf: url)
    }

    func testPublicH5CryptoAgainstNodeReference() throws {
        let data = try fixture("crypto")
        let value = try JSONDecoder().decode([String:String].self, from: data)
        XCTAssertEqual(MetroAPI.digest(body: value["body"]!, nonce: value["nonce"]!,
                                      sequence: value["sequence"]!, timestamp: value["timestamp"]!), value["digest"])
        XCTAssertEqual(String(decoding: try MetroAPI.decrypt(Data(value["encrypted"]!.utf8)), as: UTF8.self), value["plaintext"])
        let signature = try MetroAPI.encryptDigest(value["digest"]!)
        XCTAssertEqual(Data(base64Encoded: signature)?.count, 128)
        XCTAssertThrowsError(try MetroAPI.decrypt(Data("invalid-hex".utf8)))
    }

    func testFilterNonStoppingExpiredAndDuplicateTrains() throws {
        let data = Data(#"[{"arrival_time":"20261106135440","departure_time":"20261106135530","destination":"民安大道","skip_stop_flag":1},{"arrival_time":"20261106135440","departure_time":"20261106135530","destination":"民安大道","skip_stop_flag":1},{"arrival_time":"20261106140026","departure_time":"20261106140116","destination":"民安大道","skip_stop_flag":2},{"arrival_time":"20261106134000","departure_time":"20261106134030","destination":"民安大道","skip_stop_flag":1}]"#.utf8)
        let values = try JSONDecoder().decode([APITrain].self, from: data)
        let now = try XCTUnwrap(ArrivalNormalizer.date("20261106135117"))
        let trains = ArrivalNormalizer.normalize(values, now: now)
        XCTAssertEqual(trains.count, 1)
        XCTAssertEqual(trains[0].minuteText(at: now), "03")
        XCTAssertEqual(trains[0].minuteText(at: now.addingTimeInterval(180)), "00")
        XCTAssertEqual(ArrivalNormalizer.date("20261106135440")?.timeIntervalSince1970, 1_793_944_480)
    }

    func testMissingDirectionNeverUsesOppositeDirectionAndExpires() throws {
        let now = try XCTUnwrap(ArrivalNormalizer.date("20261106135117"))
        let train = TrainArrival(arrival: now.addingTimeInterval(420), departure: now.addingTimeInterval(450), destination:"上桥", nearArrival:0)
        let snapshot = ArrivalSnapshot(stationID:"5032",lineID:"50",fetchedAt:now,up:[train],down:[])
        XCTAssertEqual(snapshot.trains(.up, at: now).count, 1)
        XCTAssertTrue(snapshot.trains(.down, at: now).isEmpty)
        XCTAssertTrue(snapshot.trains(.up, at: now.addingTimeInterval(300)).isEmpty)
        XCTAssertFalse(snapshot.isFresh(at: now.addingTimeInterval(-120)))
    }

    func testCapturedResponsesRemainDecodable() throws {
        for name in ["erlang", "toutang"] {
            let envelope = try JSONDecoder().decode(APIEnvelope<APISchedule>.self, from: fixture(name))
            XCTAssertTrue(envelope.success)
            XCTAssertFalse(try XCTUnwrap(envelope.result).lines.isEmpty)
        }
    }
}
