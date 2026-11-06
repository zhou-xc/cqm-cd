import Foundation

enum TravelDirection: String, Codable, CaseIterable, Identifiable {
    case up, down
    var id: String { rawValue }
    var fallbackTitle: String { self == .up ? "方向一" : "方向二" }
}

enum CountdownMode: String, Codable, CaseIterable, Identifiable {
    case minutes, timer
    var id: String { rawValue }
    var title: String { self == .minutes ? "两位分钟 · 03" : "连续倒计时 · 3:20" }
}

struct StationChoice: Codable, Hashable, Identifiable {
    var id: String { "\(lineID):\(stationID)" }
    let stationID: String
    let stationName: String
    let lineID: String
    let lineName: String
    let upLabel: String
    let downLabel: String

    func label(for direction: TravelDirection) -> String {
        let label = direction == .up ? upLabel : downLabel
        return label.isEmpty ? direction.fallbackTitle : label
    }

    static let erlang = StationChoice(stationID: "5032", stationName: "二郎", lineID: "50",
                                     lineName: "环线", upLabel: "方向一", downLabel: "方向二")
}

struct Preferences: Codable, Equatable {
    var station = StationChoice.erlang
    var direction = TravelDirection.up
    var dark = true
    var mode = CountdownMode.minutes
    var key: String { "\(station.id):\(direction.rawValue)" }
}

struct TrainArrival: Codable, Hashable, Identifiable {
    let arrival: Date
    let departure: Date
    let destination: String
    let nearArrival: Int
    var id: String { "\(arrival.timeIntervalSince1970):\(destination)" }

    func minuteText(at now: Date) -> String {
        // Match the upstream whole-minute display; 00 means less than one minute.
        String(format: "%02d", min(99, max(0, Int(floor(arrival.timeIntervalSince(now) / 60)))))
    }
}

struct ArrivalSnapshot: Codable {
    let stationID: String
    let lineID: String
    let fetchedAt: Date
    let up: [TrainArrival]
    let down: [TrainArrival]
    static let maximumAge: TimeInterval = 5 * 60

    var expiresAt: Date { fetchedAt.addingTimeInterval(Self.maximumAge) }
    func isFresh(at now: Date) -> Bool { now >= fetchedAt.addingTimeInterval(-60) && now < expiresAt }
    func trains(_ direction: TravelDirection, at now: Date) -> [TrainArrival] {
        guard isFresh(at: now) else { return [] }
        return (direction == .up ? up : down).filter { $0.departure > now }
    }
}

struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool
    let errcode: String?
    let errmsg: String?
    let result: T?
}
struct APISchedule: Decodable { let lines: [APIScheduleLine] }
struct APIScheduleLine: Decodable {
    let line_no: String
    let line_name: String
    let up: [APITrain]?
    let down: [APITrain]?
}
struct APITrain: Decodable {
    let arrival_time: String?
    let departure_time: String?
    let destination: String?
    let terminal_station_name: String?
    let skip_stop_flag: Int?
    let near_arrive: Int?
}

enum ArrivalNormalizer {
    static func date(_ value: String?) -> Date? {
        guard let value, value.count == 14 else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Shanghai")
        formatter.dateFormat = "yyyyMMddHHmmss"
        formatter.isLenient = false
        return formatter.date(from: value)
    }

    static func normalize(_ values: [APITrain], now: Date) -> [TrainArrival] {
        var seen = Set<String>()
        return values.compactMap { item -> TrainArrival? in
            guard item.skip_stop_flag != 2, let arrival = date(item.arrival_time) else { return nil }
            // Do not invent a future train from a relative minute count or an old timestamp.
            let departure = max(date(item.departure_time) ?? arrival, arrival)
            guard departure > now else { return nil }
            let train = TrainArrival(arrival: arrival, departure: departure,
                                     destination: item.destination ?? item.terminal_station_name ?? "方向待确认",
                                     nearArrival: item.near_arrive ?? 0)
            guard seen.insert(train.id).inserted else { return nil }
            return train
        }.sorted { $0.arrival < $1.arrival }
    }
}

enum StationCatalog {
    static var all: [StationChoice] {
        guard let url = Bundle.main.url(forResource: "stations", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let stations = try? JSONDecoder().decode([StationChoice].self, from: data) else { return [.erlang] }
        return stations
    }
}
