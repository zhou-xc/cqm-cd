import SwiftUI
import WidgetKit
import AppIntents

struct StationEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "站点"
    static var defaultQuery = StationQuery()
    let id: String
    let name: String
    let line: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(line)") }
    init(_ station: StationChoice) { id = station.id; name = station.stationName; line = station.lineName }
}

struct StationQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [StationEntity] {
        StationCatalog.all.filter { identifiers.contains($0.id) }.map(StationEntity.init)
    }
    func entities(matching string: String) async throws -> [StationEntity] {
        StationCatalog.all.filter { $0.stationName.contains(string) || $0.lineName.contains(string) }.map(StationEntity.init)
    }
    func suggestedEntities() async throws -> [StationEntity] {
        let catalog = StationCatalog.all
        return catalog.sorted {
            let a = $0.stationName == "二郎" || $0.stationName == "头塘"
            let b = $1.stationName == "二郎" || $1.stationName == "头塘"
            return a == b ? $0.id < $1.id : a
        }.map(StationEntity.init)
    }
    func defaultResult() async -> StationEntity? { StationEntity(.erlang) }
}

enum WidgetDirection: String, AppEnum {
    case up, down
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "方向"
    static var caseDisplayRepresentations: [WidgetDirection: DisplayRepresentation] = [.up: "方向一", .down: "方向二"]
}
enum WidgetDisplay: String, AppEnum {
    case minutes, timer
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "显示方式"
    static var caseDisplayRepresentations: [WidgetDisplay: DisplayRepresentation] = [.minutes: "两位分钟 · 03", .timer: "分:秒 · 3:20"]
}

struct MetroConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "到站设置"
    static var description = IntentDescription("选择站点、方向和黑白外观。支持共享设置的安装版本可跟随应用。方向一/二与应用里的左右方向一致。")
    @Parameter(title: "跟随应用设置（需安装版本支持）", default: true) var followApp: Bool
    @Parameter(title: "站点") var station: StationEntity?
    @Parameter(title: "方向", default: .up) var direction: WidgetDirection
    @Parameter(title: "黑底白字", default: true) var dark: Bool
    @Parameter(title: "显示方式", default: .minutes) var display: WidgetDisplay

    var resolved: Preferences {
        if followApp && SharedStore.sharingAvailable { return SharedStore.preferences }
        var preferences = Preferences()
        preferences.station = StationCatalog.all.first { $0.id == station?.id } ?? .erlang
        preferences.direction = direction == .up ? .up : .down
        preferences.dark = dark
        preferences.mode = display == .minutes ? .minutes : .timer
        return preferences
    }
}

struct RefreshArrivals: AppIntent {
    static var title: LocalizedStringResource = "刷新到站时间"
    static var openAppWhenRun = false
    @Parameter(title: "站点标识", default: "50:5032") var stationID: String
    init() {}
    init(station: StationChoice) { stationID = station.id }
    func perform() async throws -> some IntentResult {
        let station = StationCatalog.all.first { $0.id == stationID } ?? .erlang
        _ = try await SharedStore.load(station, force: true)
        WidgetCenter.shared.reloadTimelines(ofKind: "MetroMinutesWidget")
        return .result()
    }
}

struct MetroEntry: TimelineEntry {
    let date: Date
    let preferences: Preferences
    let snapshot: ArrivalSnapshot?
    let failed: Bool
    var trains: [TrainArrival] { snapshot?.trains(preferences.direction, at: date) ?? [] }
}

struct MetroProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MetroEntry { preview() }
    func snapshot(for configuration: MetroConfiguration, in context: Context) async -> MetroEntry {
        if context.isPreview { return preview() }
        return await entry(for: configuration.resolved)
    }
    func timeline(for configuration: MetroConfiguration, in context: Context) async -> Timeline<MetroEntry> {
        let first = await entry(for: configuration.resolved)
        let now = first.date
        var dates = Set<Date>([now])
        if let snapshot = first.snapshot, snapshot.isFresh(at: now) {
            dates.insert(snapshot.expiresAt)
            for train in snapshot.trains(first.preferences.direction, at: now) {
                if train.departure < snapshot.expiresAt { dates.insert(train.departure) }
                if first.preferences.mode == .minutes {
                    // Best-effort display changes only; these entries do not perform network requests.
                    // WidgetKit may delay/coalesce them. Continuous mode uses Apple's dynamic timer.
                    for minute in 0...99 {
                        let boundary = train.arrival.addingTimeInterval(-Double(minute) * 60 + 0.1)
                        if boundary > now && boundary < snapshot.expiresAt { dates.insert(boundary) }
                    }
                }
            }
        }
        let entries = dates.sorted().map { MetroEntry(date: $0, preferences: first.preferences, snapshot: first.snapshot, failed: first.failed) }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(5 * 60)))
    }
    private func entry(for preferences: Preferences) async -> MetroEntry {
        do {
            let snapshot = try await SharedStore.load(preferences.station)
            return MetroEntry(date: .now, preferences: preferences, snapshot: snapshot, failed: false)
        } catch {
            return MetroEntry(date: .now, preferences: preferences, snapshot: SharedStore.cached(for: preferences.station), failed: true)
        }
    }
    private func preview() -> MetroEntry {
        let now = Date()
        let train = TrainArrival(arrival: now.addingTimeInterval(200), departure: now.addingTimeInterval(240), destination: "上桥", nearArrival: 0)
        let snapshot = ArrivalSnapshot(stationID: "5032", lineID: "50", fetchedAt: now, up: [train], down: [])
        return MetroEntry(date: now, preferences: Preferences(), snapshot: snapshot, failed: false)
    }
}

struct MetroWidgetView: View {
    let entry: MetroEntry
    @Environment(\.widgetFamily) private var family
    private var ink: Color { entry.preferences.dark ? .white : .black }
    private var paper: Color { entry.preferences.dark ? .black : .white }
    private var isExpired: Bool { entry.snapshot.map { !$0.isFresh(at: entry.date) } ?? false }

    var body: some View {
        HStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(entry.preferences.station.lineName).font(.system(size: 10, weight: .medium)).lineLimit(1)
                    Spacer(minLength: 2)
                    Button(intent: RefreshArrivals(station: entry.preferences.station)) {
                        Image(systemName: "arrow.clockwise").font(.system(size: 12, weight: .semibold))
                            .frame(width: 22, height: 22).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityLabel("刷新到站时间")
                }
                countdown
                Link(destination: URL(string: "metrominutes://arrivals")!) {
                    Text(entry.preferences.station.stationName).font(.system(size: 18, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                }
                Text(directionLabel).font(.system(size: 9)).lineLimit(1).minimumScaleFactor(0.6)
                HStack(spacing: 3) {
                    if let updated = entry.snapshot?.fetchedAt {
                        Text(entry.failed ? "刷新失败" : isExpired ? "已过期" : "更新")
                        Text(updated, style: .time)
                    } else { Text(entry.failed ? "查询失败 · 点↻重试" : "暂无数据 · 点↻刷新") }
                }.font(.system(size: 7)).foregroundStyle(ink.opacity(0.5)).lineLimit(1)
            }
            if family == .systemMedium {
                VStack(alignment: .leading, spacing: 16) {
                    Text("后续班次").font(.caption).foregroundStyle(ink.opacity(0.6))
                    ForEach(Array(entry.trains.dropFirst().prefix(2))) { train in
                        VStack(alignment: .leading, spacing: 3) {
                            if entry.preferences.mode == .timer && train.arrival > entry.date {
                                Text(timerInterval: entry.date...train.arrival, pauseTime: train.arrival, countsDown: true, showsHours: false)
                                    .font(.title3.monospacedDigit().weight(.semibold))
                            } else {
                                Text("\(train.minuteText(at: entry.date)) 分钟").font(.title3.monospacedDigit().weight(.semibold))
                            }
                            Text("往\(train.destination)").font(.caption2).lineLimit(1)
                        }
                    }
                    if entry.trains.count < 2 { Text("暂无更多班次").font(.caption2) }
                    Spacer(minLength: 0)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(12)
        .foregroundStyle(ink)
        .containerBackground(paper, for: .widget)
        .widgetURL(URL(string: "metrominutes://arrivals"))
    }

    @ViewBuilder private var countdown: some View {
        if let train = entry.trains.first {
            if entry.preferences.mode == .timer && train.arrival > entry.date {
                Text(timerInterval: entry.date...train.arrival, pauseTime: train.arrival, countsDown: true, showsHours: false)
                    .font(.system(size: 38, weight: .medium, design: .rounded)).monospacedDigit()
                    .minimumScaleFactor(0.65).lineLimit(1)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(train.minuteText(at: entry.date)).font(.system(size: 44, weight: .medium, design: .rounded)).monospacedDigit()
                    Text("分").font(.system(size: 11))
                }
            }
        } else {
            Text("--").font(.system(size: 44, weight: .medium, design: .rounded))
        }
    }
    private var directionLabel: String {
        if isExpired { return "数据已过期，请刷新" }
        if let next = entry.trains.first { return "往\(next.destination) · 预计" }
        return "\(entry.preferences.station.label(for: entry.preferences.direction)) · 暂无数据"
    }
}

@main
struct MetroMinutesWidget: Widget {
    let kind = "MetroMinutesWidget"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: MetroConfiguration.self, provider: MetroProvider()) { entry in
            MetroWidgetView(entry: entry)
        }
        .configurationDisplayName("到站")
        .description("黑白到站倒计时。点↻刷新，点站名查看最近几班。")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
        .containerBackgroundRemovable(false)
    }
}
