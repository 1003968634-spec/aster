import AppKit
import OSLog
import WebKit

private let appLog = Logger(subsystem: "studio.sandman.aster", category: "desktop")

@main
struct AsterApplication {
    @MainActor static func main() {
        let application = NSApplication.shared
        let delegate = AsterAppDelegate()
        application.setActivationPolicy(.regular)
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}

/// Keep the native mouse event so an asynchronous WebKit message can begin a
/// real AppKit drag, rather than approximating window movement in JavaScript.
final class EnvelopeWindow: NSWindow {
    private var lastMouseDown: NSEvent?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    override func sendEvent(_ event: NSEvent) {
        if event.type == .leftMouseDown { lastMouseDown = event }
        super.sendEvent(event)
    }

    func beginPaperDrag() {
        guard NSEvent.pressedMouseButtons & 1 == 1,
              let event = lastMouseDown else { return }
        performDrag(with: event)
    }
}

final class TransparentWebView: WKWebView {
    override var isOpaque: Bool { false }
}

/// WKUserContentController retains its handlers. This proxy keeps that ownership
/// from retaining the application delegate and window forever.
final class NativeMessageProxy: NSObject, WKScriptMessageHandler {
    weak var owner: AsterAppDelegate?
    init(owner: AsterAppDelegate) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        owner?.receive(message)
    }
}

final class AsterAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate,
                             WKNavigationDelegate, WKUIDelegate {
    private var window: EnvelopeWindow!
    private var webView: TransparentWebView!
    private var webRoot: URL!
    private var hostRepository: URL?
    private var unzoomedFrame: NSRect?
    private var sealedFrame: NSRect?
    private var workspaceSize = NSSize(width: 1180, height: 850)
    private var envelopeIsOpen = false
    private var envelopeIsTransitioning = false
    private var smokeReportWritten = false
    private var filePickerPresented = false
    private var host: DSHHost?
    private var hostOrigin: URL?
    private var hostRestartCount = 0
    private var isQuitting = false
    private var closeAnimationRequested = false
    private var closeAnimationCompleted = false
    private var interfaceReady = false
    private var interfaceLoadGeneration = 0
    private var loadingFailurePresented = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        hostRepository = hostRepository ?? DSHHost.configuredRepository()
        buildWindow()
        presentWindow()
        startDSHHostIfAvailable()
        appLog.notice("Aster desktop launched")
    }

    private func buildWindow() {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let available = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        if let saved = UserDefaults.standard.string(forKey: "AsterWorkspaceSize-v2") {
            let restored = NSSizeFromString(saved)
            if restored.width >= 860, restored.height >= 620 { workspaceSize = restored }
        }
        let size = compactSize(in: available)
        let frame = NSRect(x: available.midX - size.width / 2,
                           y: available.midY - size.height / 2,
                           width: size.width, height: size.height)
        window = EnvelopeWindow(contentRect: frame,
                                styleMask: [.borderless, .closable, .miniaturizable, .resizable],
                                backing: .buffered, defer: false)
        window.title = "Aster — A letter for your thoughts"
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false // The cut-paper layers draw their own shaped shadows.
        window.isReleasedWhenClosed = false
        window.isMovableByWindowBackground = false
        window.minSize = compactSize(in: available, preferredWidth: 620)
        window.contentAspectRatio = size
        window.collectionBehavior = [.managed, .fullScreenNone]
        window.delegate = self
        // A workspace's large saved frame must never become the sealed launch frame.
        if let saved = UserDefaults.standard.string(forKey: "AsterSealedOrigin-v2") {
            window.setFrameOrigin(NSPointFromString(saved))
            clampToAvailableScreen()
        }

        let controller = WKUserContentController()
        controller.add(NativeMessageProxy(owner: self), name: "asterNative")
        let diagnostics = """
        (() => {
          const report = message => window.webkit.messageHandlers.asterNative.postMessage({action:'diagnostic', message:String(message).slice(0,1200)});
          window.addEventListener('error', event => report(event.message + ' @ ' + event.filename + ':' + event.lineno));
          window.addEventListener('unhandledrejection', event => report(event.reason));
        })();
        """
        controller.addUserScript(WKUserScript(source: diagnostics, injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = controller
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = TransparentWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
        webView.underPageBackgroundColor = .clear
        // WebKit on macOS still paints an opaque page behind transparent HTML.
        // Local prototype compatibility: the public underPageBackgroundColor
        // controls overscroll only. Revisit this WebKit flag before App Store work.
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.allowsBackForwardNavigationGestures = false
        webView.setAccessibilityLabel("Aster envelope workspace")
        #if DEBUG
        webView.isInspectable = true
        #endif
        // Keep the real WebKit document mounted from the start. The window is
        // presented only when its photographic artwork and fonts are ready;
        // a second, hand-drawn placeholder would visibly change the envelope.
        window.contentView = webView

        guard let resources = Bundle.main.resourceURL else {
            showLoadingFailure("The app's bundled resources could not be found.")
            return
        }
        webRoot = resources.appendingPathComponent("Web", isDirectory: true).standardizedFileURL
        let index = webRoot.appendingPathComponent("index.html")
        guard FileManager.default.fileExists(atPath: index.path) else {
            showLoadingFailure("The bundled interface is missing. Rebuild Aster with script/build_and_run.sh.")
            return
        }
        if hostRepository == nil { loadOfflineInterface() }
    }

    private func clampToAvailableScreen() {
        let available = (window.screen ?? NSScreen.main)?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var frame = window.frame
        frame.size.width = min(frame.width, available.width - 16)
        frame.size.height = min(frame.height, available.height - 16)
        frame.origin.x = min(max(frame.minX, available.minX + 8), available.maxX - frame.width - 8)
        frame.origin.y = min(max(frame.minY, available.minY + 8), available.maxY - frame.height - 8)
        window.setFrame(frame, display: false)
    }

    private func compactSize(in available: NSRect, preferredWidth: CGFloat = 820) -> NSSize {
        let width = max(280, min(preferredWidth, available.width - 80,
                                 (available.height - 96) / 0.566))
        return NSSize(width: width + 64, height: ceil(width * 0.566 + 80))
    }

    private func fittedFrame(size: NSSize, centeredOn frame: NSRect) -> NSRect {
        let available = (window.screen ?? NSScreen.main)?.visibleFrame ?? frame
        let size = NSSize(width: min(size.width, available.width - 16),
                          height: min(size.height, available.height - 16))
        return NSRect(x: min(max(frame.midX - size.width / 2, available.minX + 8), available.maxX - size.width - 8),
                      y: min(max(frame.midY - size.height / 2, available.minY + 8), available.maxY - size.height - 8),
                      width: size.width, height: size.height)
    }

    /// Reframe the existing transparent web view. The page anchors the sealed
    /// artwork before the viewport changes, then acknowledges layout before flight.
    private func reframeEnvelope(opening: Bool, requestID: String) {
        let old = window.frame
        let available = (window.screen ?? NSScreen.main)?.visibleFrame ?? old
        envelopeIsTransitioning = true
        let target: NSRect
        if opening {
            sealedFrame = old
            unzoomedFrame = nil
            // A zoomed envelope may already be larger than the saved workspace.
            // Keep enough room for that artwork until the letter is extracted.
            target = fittedFrame(size: NSSize(width: max(workspaceSize.width, old.width),
                                              height: max(workspaceSize.height, old.height)), centeredOn: old)
            window.contentAspectRatio = .zero
        } else {
            workspaceSize = unzoomedFrame?.size ?? old.size
            UserDefaults.standard.set(NSStringFromSize(workspaceSize), forKey: "AsterWorkspaceSize-v2")
            let width = min((sealedFrame?.width ?? 884) - 64,
                            old.width - 64, (old.height - 80) / 0.566)
            target = fittedFrame(size: compactSize(in: available, preferredWidth: width), centeredOn: old)
            unzoomedFrame = nil
        }
        // Convert AppKit's bottom-left coordinates to the page's top-left space.
        let detail: [String: Any] = ["requestId": requestID, "opening": opening,
            "oldWidth": old.width, "oldHeight": old.height,
            "width": target.width, "height": target.height,
            "offsetX": old.midX - target.midX, "offsetY": target.midY - old.midY]
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.asterEnvelope?.prepareFrame(\(json))") { [weak self] _, _ in
            guard let self else { return }
            self.window.minSize = opening
                ? NSSize(width: min(860, available.width - 16), height: min(620, available.height - 16))
                : self.compactSize(in: available, preferredWidth: 620)
            // Invisible bounds expand immediately; the envelope keeps its screen
            // position. Only the paper artwork animates, without resizing text.
            self.window.setFrame(target, display: true)
            if !opening { self.window.contentAspectRatio = target.size }
            self.envelopeIsOpen = opening
            appLog.info("Envelope window: \(opening ? "workspace" : "compact", privacy: .public), \(Int(target.width)) × \(Int(target.height))")
            self.webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('aster-window-ready', {detail: \(json)}))", completionHandler: nil)
        }
    }

    func windowDidMove(_ notification: Notification) {
        guard !envelopeIsOpen, !envelopeIsTransitioning else { return }
        UserDefaults.standard.set(NSStringFromPoint(window.frame.origin), forKey: "AsterSealedOrigin-v2")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // A new document starts sealed, including a Host reconnect or WebKit
        // recovery. Reset the native geometry before that cover is painted.
        guard envelopeIsOpen || envelopeIsTransitioning else { return }
        let old = window.frame
        let available = (window.screen ?? NSScreen.main)?.visibleFrame ?? old
        if envelopeIsOpen {
            workspaceSize = unzoomedFrame?.size ?? old.size
            UserDefaults.standard.set(NSStringFromSize(workspaceSize), forKey: "AsterWorkspaceSize-v2")
        }
        let size = compactSize(in: available)
        window.contentAspectRatio = .zero
        window.minSize = compactSize(in: available, preferredWidth: 620)
        window.setFrame(fittedFrame(size: size, centeredOn: old), display: true)
        window.contentAspectRatio = size
        unzoomedFrame = nil
        sealedFrame = nil
        envelopeIsOpen = false
        envelopeIsTransitioning = false
    }

    private func presentWindow() {
        guard interfaceReady else {
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if window.contentView === webView { window.makeFirstResponder(webView) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !closeAnimationCompleted, window != nil, webView != nil,
           window.contentView === webView {
            requestClose()
            return .terminateCancel
        }
        isQuitting = true
        guard let host, host.isRunning else { return .terminateNow }
        host.stop()
        // Give DSH a bounded graceful shutdown for its active sessions/jobs.
        // A hung plugin cannot hold the desktop application open indefinitely.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self, weak host] in
            guard let self, self.isQuitting, let host, host.isRunning else { return }
            host.forceStop()
        }
        return .terminateLater
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        presentWindow()
        return true
    }

    /// LaunchServices passes the selected DSH folder as a document. Consume
    /// that event so AppKit does not open an unsupported-document modal alert
    /// while the Host is waiting to hand its URL back on the main queue.
    func application(_ sender: NSApplication, openFile filename: String) -> Bool {
        let repository = URL(fileURLWithPath: filename, isDirectory: true).standardizedFileURL
        let manifest = repository.appendingPathComponent("package.json")
        guard FileManager.default.fileExists(atPath: manifest.path) else { return false }
        if hostRepository == nil {
            hostRepository = repository
            startDSHHostIfAvailable()
        }
        return true
    }

    private func startDSHHostIfAvailable() {
        guard !isQuitting, host == nil, let repository = hostRepository,
              let webRoot else { return }
        let controller = DSHHost(repository: repository,
                                 index: webRoot.appendingPathComponent("index.html"))
        controller.onReady = { [weak self, weak controller] url in
            guard let self, let controller, self.host === controller, !self.isQuitting else { return }
            self.hostDidBecomeReady(url)
        }
        controller.onExit = { [weak self, weak controller] code in
            guard let self, let controller, self.host === controller else { return }
            self.hostDidExit(code: code)
        }
        do {
            try controller.start()
            host = controller
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self, weak controller] in
                guard let self, let controller, self.host === controller,
                      self.hostOrigin == nil, controller.isRunning else { return }
                appLog.error("DSH Host startup timed out")
                controller.stop()
            }
        } catch {
            appLog.error("DSH Host could not start: \(error.localizedDescription, privacy: .public)")
            loadOfflineInterface()
        }
    }

    private func hostDidBecomeReady(_ url: URL) {
        guard let controller = host else { return }
        DSHHost.authenticate(url) { [weak self, weak controller] result in
            DispatchQueue.main.async { [weak self, weak controller] in
                guard let self, let controller, self.host === controller,
                      !self.isQuitting else { return }
                switch result {
                case .success(let authenticated):
                    self.loadAuthenticatedHost(authenticated, controller: controller)
                case .failure(let error):
                    appLog.error("DSH browser authentication failed: \(error.localizedDescription, privacy: .public)")
                    controller.stop()
                }
            }
        }
    }

    private func loadAuthenticatedHost(_ authenticated: DSHHost.AuthenticatedHost,
                                       controller: DSHHost) {
        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        let group = DispatchGroup()
        for cookie in authenticated.cookies {
            group.enter()
            cookieStore.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { [weak self, weak controller] in
            guard let self, let controller, self.host === controller,
                  controller.isRunning, !self.isQuitting else { return }
            self.hostOrigin = authenticated.cleanURL
            var request = URLRequest(url: authenticated.cleanURL,
                                     cachePolicy: .reloadIgnoringLocalCacheData)
            // SameSite=Strict may reject the first file:// -> loopback top-level
            // navigation. The native-owned header covers only this clean root
            // request; subsequent same-origin requests use WebKit's cookie jar.
            let cookieHeader = authenticated.cookies
                .map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
            request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
            self.installWebViewIfNeeded()
            self.webView.load(request)
            appLog.notice("Connecting Aster to authenticated local DSH Host")
        }
    }

    private func hostDidExit(code: Int32) {
        host = nil
        if isQuitting {
            NSApp.reply(toApplicationShouldTerminate: true)
            return
        }
        if hostOrigin != nil || !interfaceReady {
            hostOrigin = nil
            loadOfflineInterface()
        }
        let delays: [TimeInterval] = [2, 10]
        guard hostRestartCount < delays.count else {
            appLog.error("DSH Host unavailable; Aster remains in offline preview")
            return
        }
        let delay = delays[hostRestartCount]
        hostRestartCount += 1
        appLog.error("DSH Host stopped (code \(code)); retrying")
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.startDSHHostIfAvailable()
        }
    }

    private func loadOfflineInterface() {
        guard let webRoot else { return }
        let index = webRoot.appendingPathComponent("index.html")
        guard FileManager.default.fileExists(atPath: index.path) else { return }
        installWebViewIfNeeded()
        webView.loadFileURL(index, allowingReadAccessTo: webRoot)
    }

    private func installWebViewIfNeeded() {
        guard window.contentView !== webView else { return }
        window.contentView = webView
        window.makeFirstResponder(webView)
    }

    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let page = message.frameInfo.request.url, isTrustedInterfaceURL(page),
              let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else { return }
        switch action {
        case "interface-ready":
            guard !interfaceReady else { return }
            interfaceReady = true
            appLog.notice("Photographic envelope resources ready; presenting interface")
            presentWindow()
            writeSmokeReportIfRequested()
        case "interface-failed":
            let detail = String((payload["message"] as? String ?? "Envelope artwork could not load.").prefix(1200))
            showLoadingFailure(detail)
        case "close": requestClose()
        case "close-now": closeWindow(nil)
        case "minimize": minimizeWindow(nil)
        case "zoom": zoomWindow(nil)
        case "drag": if !envelopeIsTransitioning { window.beginPaperDrag() }
        case "chooseWorkspaces":
            guard let requestID = payload["requestId"] as? String,
                  !requestID.isEmpty, requestID.count <= 256 else { return }
            chooseWorkspaces(requestID: requestID)
        case "expand-envelope", "compact-envelope":
            guard let requestID = payload["requestId"] as? String, requestID.count <= 128 else { return }
            reframeEnvelope(opening: action == "expand-envelope", requestID: requestID)
        case "folding": envelopeIsTransitioning = true
        case "opened", "sealed":
            envelopeIsTransitioning = false
            window.title = action == "opened" ? "Aster — Your paper universe" : "Aster — A letter for your thoughts"
            appLog.info("Envelope state: \(action, privacy: .public)")
        case "diagnostic":
            let detail = String((payload["message"] as? String ?? "Unknown script error").prefix(1200))
            appLog.error("Interface: \(detail, privacy: .public)")
        default: break
        }
    }

    private func isBundledURL(_ url: URL) -> Bool {
        guard url.isFileURL, let webRoot else { return false }
        let path = url.standardizedFileURL.path
        return path == webRoot.path || path.hasPrefix(webRoot.path + "/")
    }

    private func isHostURL(_ url: URL) -> Bool {
        guard let origin = hostOrigin else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" &&
            url.port == origin.port && url.user == nil && url.password == nil
    }

    private func isTrustedInterfaceURL(_ url: URL) -> Bool {
        hostOrigin == nil ? isBundledURL(url) : isHostURL(url)
    }

    /// The chooser returns names and paths only. Selecting a workspace does not
    /// enumerate its contents, execute commands, or change filesystem access.
    private func chooseWorkspaces(requestID: String) {
        guard !filePickerPresented, window.attachedSheet == nil else {
            reportWorkspaces(requestID: requestID, items: [], cancelled: true)
            return
        }
        filePickerPresented = true
        let panel = NSOpenPanel()
        panel.title = "Choose workspaces"
        panel.prompt = "Add workspaces"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = true
        panel.canCreateDirectories = false
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.filePickerPresented = false
            var seen = Set<String>()
            let items: [[String: String]] = response == .OK ? panel.urls.compactMap { selected in
                let url = selected.standardizedFileURL
                guard url.isFileURL, seen.insert(url.path).inserted else { return nil }
                return ["path": url.path, "name": url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent]
            } : []
            self.reportWorkspaces(requestID: requestID, items: items, cancelled: response != .OK)
        }
    }

    private func reportWorkspaces(requestID: String, items: [[String: String]], cancelled: Bool) {
        let detail: [String: Any] = ["requestId": requestID, "items": items, "cancelled": cancelled]
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        // Only serialized data is embedded in the fixed event-delivery script.
        let escaped = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('aster-workspaces-picked', {detail: \(escaped)}));",
                                   completionHandler: nil)
    }

    // The envelope's closing animation is the app's exit animation. Route its
    // final frame through AppKit termination so the owned Host also shuts down.
    @objc private func closeWindow(_ sender: Any?) {
        closeAnimationCompleted = true
        NSApp.terminate(nil)
    }
    @objc private func requestCloseWindow(_ sender: Any?) { requestClose() }
    private func requestClose() {
        guard !closeAnimationRequested else { return }
        closeAnimationRequested = true
        let script = """
        (() => {
          const envelope = window.asterEnvelope;
          if (envelope?.closeApplication) envelope.closeApplication();
          else window.webkit?.messageHandlers?.asterNative?.postMessage({action:'close-now'});
        })()
        """
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if error != nil { self?.closeWindow(nil) }
        }
        // WebKit can stop timers while minimized or during a failed load. A
        // bounded fallback still lets a native quit finish and stop the Host.
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            guard let self, self.closeAnimationRequested,
                  !self.closeAnimationCompleted else { return }
            self.closeWindow(nil)
        }
    }
    @objc private func minimizeWindow(_ sender: Any?) { window.miniaturize(nil) }
    @objc private func showWindow(_ sender: Any?) { presentWindow() }
    @objc private func zoomWindow(_ sender: Any?) {
        guard !envelopeIsTransitioning else { return }
        if !envelopeIsOpen {
            let available = (window.screen ?? NSScreen.main)?.visibleFrame ?? window.frame
            let normal = compactSize(in: available)
            let large = compactSize(in: available, preferredWidth: available.width)
            let targetSize = window.frame.width > normal.width + 2 ? normal : large
            window.contentAspectRatio = .zero
            window.setFrame(fittedFrame(size: targetSize, centeredOn: window.frame), display: true)
            window.contentAspectRatio = targetSize
            return
        }
        if let frame = unzoomedFrame {
            unzoomedFrame = nil
            window.setFrame(frame, display: true, animate: true)
        } else {
            unzoomedFrame = window.frame
            let visible = (window.screen ?? NSScreen.main)?.visibleFrame ?? window.frame
            window.setFrame(visible.insetBy(dx: 8, dy: 8), display: true, animate: true)
        }
    }

    private func installMenus() {
        let menu = NSMenu()
        let application = NSMenu(title: "Aster")
        application.addItem(withTitle: "About Aster", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Hide Aster", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = application.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        application.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Quit Aster", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        append(application, to: menu)

        let file = NSMenu(title: "File")
        file.addItem(withTitle: "Close Window", action: #selector(requestCloseWindow(_:)), keyEquivalent: "w").target = self
        append(file, to: menu)

        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        for (title, action, shortcut) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
                                          ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: shortcut)
        }
        append(edit, to: menu)

        let windows = NSMenu(title: "Window")
        windows.addItem(withTitle: "Minimize", action: #selector(minimizeWindow(_:)), keyEquivalent: "m").target = self
        windows.addItem(withTitle: "Zoom", action: #selector(zoomWindow(_:)), keyEquivalent: "").target = self
        windows.addItem(withTitle: "Show Aster", action: #selector(showWindow(_:)), keyEquivalent: "0").target = self
        append(windows, to: menu)
        NSApp.mainMenu = menu
        NSApp.windowsMenu = windows
    }

    private func append(_ submenu: NSMenu, to menu: NSMenu) {
        let item = NSMenuItem(title: submenu.title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        menu.addItem(item)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if isTrustedInterfaceURL(url) || url.absoluteString == "about:blank" {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated { openExternal(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url {
            openExternal(url)
        }
        return nil
    }

    private func openExternal(_ url: URL) {
        guard ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") else { return }
        NSWorkspace.shared.open(url)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard !filePickerPresented, window.attachedSheet == nil else {
            completionHandler(nil)
            return
        }
        filePickerPresented = true
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { [weak self] response in
            self?.filePickerPresented = false
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        interfaceReady = false
        interfaceLoadGeneration += 1
        let generation = interfaceLoadGeneration
        // This is an error watchdog, never a timed reveal of an unfinished page.
        // In particular, a missing startup script cannot leave a hidden app stuck.
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            guard let self, !self.isQuitting, !self.interfaceReady,
                  self.interfaceLoadGeneration == generation else { return }
            self.showLoadingFailure("The envelope's artwork or interface did not finish loading. Please retry.")
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if hostOrigin == nil { appLog.notice("Bundled interface document loaded") }
        else { appLog.notice("DSH interface document loaded") }
        // Navigation completion alone does not mean dynamically inserted raster
        // layers have decoded. envelope.js owns the separate ready handshake.
        webView.evaluateJavaScript("!!window.asterEnvelope") { [weak self] value, error in
            guard let self, !self.isQuitting, !self.interfaceReady else { return }
            if error != nil || (value as? Bool) != true {
                self.showLoadingFailure("The envelope interface could not initialize. Please retry.")
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        appLog.error("Navigation failed: \(error.localizedDescription, privacy: .public)")
        showLoadingFailure(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        appLog.error("Initial interface load failed: \(error.localizedDescription, privacy: .public)")
        if hostOrigin != nil {
            hostOrigin = nil
            loadOfflineInterface()
            host?.stop()
            return
        }
        showLoadingFailure(error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        appLog.error("Web content process terminated; reloading saved local workspace")
        webView.reload()
    }

    private func showLoadingFailure(_ message: String) {
        guard !loadingFailurePresented, !isQuitting else { return }
        loadingFailurePresented = true
        interfaceLoadGeneration += 1 // Cancel the current navigation watchdog.
        appLog.error("Loading failure: \(message, privacy: .public)")
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Aster could not open its letter"
        alert.informativeText = message
        let canRetry = webView?.url != nil
        alert.addButton(withTitle: canRetry ? "Retry" : "Quit")
        if canRetry { alert.addButton(withTitle: "Quit") }
        let response = alert.runModal()
        loadingFailurePresented = false
        if canRetry && response == .alertFirstButtonReturn {
            webView.reload()
        } else {
            closeWindow(nil)
        }
    }

    /// Optional, explicit command-line verification used by the local build.
    /// It reports the bundled page's readiness without adding a JavaScript API.
    private func writeSmokeReportIfRequested() {
        let arguments = CommandLine.arguments
        let hostReport = arguments.firstIndex(of: "--host-smoke-report")
        if hostReport != nil && hostOrigin == nil { return }
        guard !smokeReportWritten,
              let flag = hostReport ?? arguments.firstIndex(of: "--smoke-report"),
              CommandLine.arguments.indices.contains(flag + 1) else { return }
        smokeReportWritten = true
        let destination = URL(fileURLWithPath: CommandLine.arguments[flag + 1])
        let script = """
        (() => {
          let storage = false;
          try { localStorage.setItem('aster-native-smoke','ok'); storage = localStorage.getItem('aster-native-smoke') === 'ok'; localStorage.removeItem('aster-native-smoke'); } catch (_) {}
          return JSON.stringify({readyState:document.readyState, title:document.title, href:location.href,
            storage, nativeBridge:!!window.webkit?.messageHandlers?.asterNative,
            envelope:!!window.asterEnvelope, envelopeReady:window.asterEnvelope?.readiness?.(),
            viewport:{width:innerWidth,height:innerHeight},
            envelopeBounds:document.getElementById('desktop-envelope')?.getBoundingClientRect().toJSON(),
            chromeBounds:document.getElementById('desktop-chrome')?.getBoundingClientRect().toJSON(),
            bodyBackground:getComputedStyle(document.body).backgroundColor,
            missingImages:[...document.images].filter(i=>!i.complete || i.naturalWidth===0).map(i=>i.getAttribute('src')),
            fontStatus:document.fonts.status});
        })()
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.webView.evaluateJavaScript(script) { [weak self] result, error in
                let data = (result as? String)?.data(using: .utf8) ?? Data()
                var report = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
                if let error {
                    report["javaScriptError"] = error.localizedDescription
                    appLog.error("Smoke verification: \(error.localizedDescription, privacy: .public)")
                }
                self?.writeSnapshotSmokeReport(report, destination: destination)
            }
        }
    }

    private func writeSnapshotSmokeReport(_ pageReport: [String: Any], destination: URL) {
        let configuration = WKSnapshotConfiguration()
        configuration.afterScreenUpdates = true
        webView.takeSnapshot(with: configuration) { image, error in
            var report = pageReport
            if let error { report["snapshotError"] = error.localizedDescription }
            if let image, let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                let bitmap = NSBitmapImageRep(cgImage: cgImage)
                report["snapshotWidth"] = bitmap.pixelsWide
                report["snapshotHeight"] = bitmap.pixelsHigh
                report["snapshotHasAlpha"] = bitmap.hasAlpha
                report["snapshotCornerAlpha"] = bitmap.colorAt(x: 0, y: 0)?.alphaComponent
                report["snapshotCornerColor"] = bitmap.colorAt(x: 0, y: 0)?.description
                report["snapshotOppositeCornerAlpha"] = bitmap.colorAt(x: bitmap.pixelsWide - 1,
                                                                       y: bitmap.pixelsHigh - 1)?.alphaComponent
                if let png = bitmap.representation(using: .png, properties: [:]) {
                    let snapshotURL = destination.deletingPathExtension().appendingPathExtension("png")
                    do {
                        try png.write(to: snapshotURL, options: .atomic)
                        report["snapshotPath"] = snapshotURL.path
                    } catch { report["snapshotWriteError"] = error.localizedDescription }
                }
            }
            do {
                let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
                try data.write(to: destination, options: .atomic)
                appLog.notice("Smoke report written: \(destination.path, privacy: .public)")
            } catch { appLog.error("Could not write smoke report: \(error.localizedDescription, privacy: .public)") }
        }
    }
}
