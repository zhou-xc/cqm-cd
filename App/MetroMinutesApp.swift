import SwiftUI
import WidgetKit

@main
struct MetroMinutesApp: App {
    var body: some Scene {
        WindowGroup { ArrivalsView() }
    }
}

@MainActor
final class ArrivalsModel: ObservableObject {
    @Published var preferences = SharedStore.preferences
    @Published var snapshot: ArrivalSnapshot?
    @Published var loading = false
    @Published var error: String?
    private var generation = 0

    init() { snapshot = SharedStore.cached(for: preferences.station) }

    func savePreferences() {
        SharedStore.preferences = preferences
        WidgetCenter.shared.reloadAllTimelines()
    }

    func select(_ station: StationChoice) async {
        generation += 1
        preferences.station = station
        preferences.direction = .up
        snapshot = SharedStore.cached(for: station)
        error = nil
        savePreferences()
        await refresh()
    }

    func refresh(force: Bool = true) async {
        generation += 1
        let current = generation
        let station = preferences.station
        loading = true
        error = nil
        do {
            let result = try await SharedStore.load(station, force: force)
            guard generation == current, preferences.station.id == station.id else { return }
            snapshot = result
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            guard generation == current else { return }
            self.error = error.localizedDescription
        }
        if generation == current { loading = false }
    }

    func directionTitle(_ direction: TravelDirection, now: Date) -> String {
        if let next = snapshot?.trains(direction, at: now).first { return "往\(next.destination)" }
        return preferences.station.label(for: direction)
    }
}

struct ArrivalsView: View {
    @StateObject private var model = ArrivalsModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var showStations = false
    @State private var showSettings = false

    private var foreground: Color { model.preferences.dark ? .white : .black }
    private var background: Color { model.preferences.dark ? .black : .white }

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        stationHeader
                        directionPicker(now: context.date)
                        arrivalCard(now: context.date)
                        refreshButton
                        status(now: context.date)
                        if !SharedStore.sharingAvailable {
                            Text("桌面小组件请长按 → 编辑小组件，选择站点和方向。当前安装版本的应用内设置独立保存。")
                                .font(.footnote).foregroundStyle(foreground.opacity(0.65))
                        }
                        Text("到站时间来自渝畅行公开网页接口，可能调整。以车站现场信息为准。")
                            .font(.caption).foregroundStyle(foreground.opacity(0.5))
                    }
                    .padding(24)
                }
                .refreshable { await model.refresh() }
            }
            .background(background)
            .foregroundStyle(foreground)
            .navigationTitle("到站")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3") }
                        .accessibilityLabel("显示设置")
                }
            }
            .sheet(isPresented: $showStations) {
                StationPicker(selected: model.preferences.station) { station in
                    showStations = false
                    Task { await model.select(station) }
                }
            }
            .sheet(isPresented: $showSettings) { settings }
            .task { await model.refresh(force: false) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await model.refresh(force: false) } }
            }
            .onOpenURL { _ in Task { await model.refresh() } }
            .onChange(of: model.preferences) { _, _ in model.savePreferences() }
        }
        .tint(foreground)
        .preferredColorScheme(model.preferences.dark ? .dark : .light)
    }

    private var stationHeader: some View {
        Button { showStations = true } label: {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(model.preferences.station.lineName).font(.caption.weight(.medium)).tracking(2)
                    Text(model.preferences.station.stationName).font(.system(size: 40, weight: .bold))
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.title3)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("切换站点，当前\(model.preferences.station.stationName)")
    }

    private func directionPicker(now: Date) -> some View {
        HStack(spacing: 10) {
            ForEach(TravelDirection.allCases) { direction in
                let selected = model.preferences.direction == direction
                Button { model.preferences.direction = direction } label: {
                    VStack(spacing: 5) {
                        Text(model.directionTitle(direction, now: now)).font(.subheadline.weight(.semibold)).lineLimit(1)
                        if model.snapshot != nil && (model.snapshot?.trains(direction, at: now).isEmpty ?? true) {
                            Text("暂无数据").font(.caption2)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 42).padding(8)
                    .foregroundStyle(selected ? background : foreground)
                    .background(selected ? foreground : foreground.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }.buttonStyle(.plain)
            }
        }
    }

    private func arrivalCard(now: Date) -> some View {
        let trains = model.snapshot?.trains(model.preferences.direction, at: now) ?? []
        return VStack(alignment: .leading, spacing: 20) {
            Text("最近一班 · 预计").font(.subheadline).foregroundStyle(foreground.opacity(0.6))
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(trains.first?.minuteText(at: now) ?? "--")
                    .font(.system(size: 106, weight: .medium, design: .rounded)).monospacedDigit()
                    .contentTransition(.numericText(countsDown: true))
                Text("分钟").font(.title3)
            }
            if let first = trains.first {
                Text(first.arrival <= now ? "已到预计到站时间，请留意站台" : "开往\(first.destination)")
                    .font(.subheadline)
                ForEach(Array(trains.dropFirst().prefix(3).enumerated()), id: \.element.id) { index, train in
                    HStack {
                        Text("后续第\(index + 1)班").foregroundStyle(foreground.opacity(0.6))
                        Text("往\(train.destination)").lineLimit(1)
                        Spacer()
                        Text("\(train.minuteText(at: now)) 分钟").monospacedDigit().fontWeight(.semibold)
                    }.font(.subheadline)
                }
            } else {
                Text(emptyMessage(now: now)).font(.subheadline).foregroundStyle(foreground.opacity(0.65))
            }
        }
        .padding(24).frame(maxWidth: .infinity, alignment: .leading)
        .background(foreground.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 28))
    }

    private func emptyMessage(now: Date) -> String {
        if model.loading { return "正在查询到站时间…" }
        if let snapshot = model.snapshot, !snapshot.isFresh(at: now) { return "数据已过期，请刷新" }
        return "此方向暂未返回可乘班次"
    }

    private var refreshButton: some View {
        Button { Task { await model.refresh() } } label: {
            HStack(spacing: 10) {
                if model.loading { ProgressView().tint(background) } else { Image(systemName: "arrow.clockwise") }
                Text(model.loading ? "正在刷新" : "刷新到站时间").fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity).padding(18)
            .foregroundStyle(background).background(foreground).clipShape(Capsule())
        }.disabled(model.loading).buttonStyle(.plain)
    }

    @ViewBuilder private func status(now: Date) -> some View {
        if let error = model.error {
            Label(error, systemImage: "exclamationmark.circle").font(.footnote)
        }
        if let snapshot = model.snapshot {
            HStack {
                Text(snapshot.isFresh(at: now) ? "上次更新" : "已过期 · 上次更新")
                Text(snapshot.fetchedAt, style: .time)
                Spacer()
            }.font(.caption).foregroundStyle(foreground.opacity(0.55))
        }
    }

    private var settings: some View {
        NavigationStack {
            Form {
                Section("外观") { Toggle("黑底白字", isOn: $model.preferences.dark) }
                Section("桌面倒计时") {
                    Picker("显示方式", selection: $model.preferences.mode) {
                        ForEach(CountdownMode.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.inline)
                    Text("两位分钟数按小组件时间轴更新，系统可能延迟。分:秒模式由系统持续倒计时。两种显示都基于上次查询结果，5 分钟后标为过期。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("添加到桌面") {
                    Text("长按主屏幕空白处 → 编辑 → 添加小组件 → 搜索「到站」。点小组件右上角刷新，点站名打开应用。")
                    if SharedStore.sharingAvailable {
                        Text("默认跟随应用内设置；也可长按小组件 → 编辑小组件，为不同小组件分别指定站点。")
                    } else {
                        Text("此安装版本请在「编辑小组件」里单独设置站点、方向和外观。")
                    }
                }
            }
            .navigationTitle("设置").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { showSettings = false } } }
        }
    }
}

struct StationPicker: View {
    let selected: StationChoice
    let onSelect: (StationChoice) -> Void
    @State private var search = ""
    private let stations = StationCatalog.all
    private var filtered: [StationChoice] {
        search.isEmpty ? stations : stations.filter { $0.stationName.localizedCaseInsensitiveContains(search) || $0.lineName.contains(search) }
    }
    var body: some View {
        NavigationStack {
            List(filtered) { station in
                Button { onSelect(station) } label: {
                    HStack {
                        Text(station.stationName).foregroundStyle(.primary)
                        Spacer()
                        Text(station.lineName).foregroundStyle(.secondary)
                        if station.id == selected.id { Image(systemName: "checkmark") }
                    }
                }
            }
            .searchable(text: $search, prompt: "搜索站点或线路")
            .navigationTitle("选择站点")
        }
    }
}
