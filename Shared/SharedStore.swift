import Foundation

enum SharedStore {
    static var groupID: String { Bundle.main.object(forInfoDictionaryKey: "MetroAppGroup") as? String ?? "" }
    static let sharingAvailable: Bool = {
        !groupID.isEmpty && FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) != nil
    }()
    private static var defaults: UserDefaults {
        if sharingAvailable, let shared = UserDefaults(suiteName: groupID) { return shared }
        return .standard
    }
    static var preferences: Preferences {
        get {
            guard let data = defaults.data(forKey: "preferences"),
                  let value = try? JSONDecoder().decode(Preferences.self, from: data) else { return Preferences() }
            return value
        }
        set { if let data = try? JSONEncoder().encode(newValue) { defaults.set(data, forKey: "preferences") } }
    }
    static func cached(for station: StationChoice) -> ArrivalSnapshot? {
        guard let data = defaults.data(forKey: "arrivals.\(station.id)"),
              let value = try? JSONDecoder().decode(ArrivalSnapshot.self, from: data),
              value.stationID == station.stationID, value.lineID == station.lineID else { return nil }
        return value
    }
    static func save(_ snapshot: ArrivalSnapshot, for station: StationChoice) {
        if let data = try? JSONEncoder().encode(snapshot) { defaults.set(data, forKey: "arrivals.\(station.id)") }
    }
    static func load(_ station: StationChoice, force: Bool = false) async throws -> ArrivalSnapshot {
        if !force, let cached = cached(for: station), Date().timeIntervalSince(cached.fetchedAt) < 15,
           cached.isFresh(at: Date()) { return cached }
        let fresh = try await MetroAPI().arrivals(for: station)
        save(fresh, for: station)
        return fresh
    }
}
