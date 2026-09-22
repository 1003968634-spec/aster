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
    private var unzoomedFrame: NSRect?
    private var smokeReportWritten = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMenus()
        buildWindow()
        presentWindow()
        appLog.notice("Aster desktop launched")
    }

    private func buildWindow() {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let available = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1180, available.width - 24),
                          height: min(850, available.height - 24))
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
        window.minSize = NSSize(width: min(860, available.width - 24),
                                height: min(620, available.height - 24))
        window.collectionBehavior = [.managed, .fullScreenNone]
        window.delegate = self
        if window.setFrameUsingName("AsterEnvelopeWindow-v1") {
            clampToAvailableScreen()
        }
        window.setFrameAutosaveName("AsterEnvelopeWindow-v1")

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
        webView.loadFileURL(index, allowingReadAccessTo: webRoot)
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

    private func presentWindow() {
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window.makeFirstResponder(webView)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        presentWindow()
        return true
    }

    func receive(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let page = message.frameInfo.request.url, isBundledURL(page),
              let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else { return }
        switch action {
        case "close": closeWindow(nil)
        case "minimize": minimizeWindow(nil)
        case "zoom": zoomWindow(nil)
        case "drag": window.beginPaperDrag()
        case "opened", "sealed":
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

    @objc private func closeWindow(_ sender: Any?) { window.close() }
    @objc private func minimizeWindow(_ sender: Any?) { window.miniaturize(nil) }
    @objc private func showWindow(_ sender: Any?) { presentWindow() }
    @objc private func foldEnvelope(_ sender: Any?) {
        webView.evaluateJavaScript("window.asterEnvelope?.status?.() === 'sealed' ? window.asterEnvelope?.open?.() : window.asterEnvelope?.fold?.()", completionHandler: nil)
    }
    @objc private func zoomWindow(_ sender: Any?) {
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
        let fold = file.addItem(withTitle: "Fold Letter", action: #selector(foldEnvelope(_:)), keyEquivalent: "l")
        fold.target = self
        fold.keyEquivalentModifierMask = [.command, .shift]
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(closeWindow(_:)), keyEquivalent: "w").target = self
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
        if isBundledURL(url) || url.absoluteString == "about:blank" {
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
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        appLog.notice("Bundled interface ready")
        writeSmokeReportIfRequested()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        appLog.error("Navigation failed: \(error.localizedDescription, privacy: .public)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        appLog.error("Initial interface load failed: \(error.localizedDescription, privacy: .public)")
        showLoadingFailure(error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        appLog.error("Web content process terminated; reloading saved local workspace")
        webView.reload()
    }

    private func showLoadingFailure(_ message: String) {
        appLog.error("Loading failure: \(message, privacy: .public)")
        let alert = NSAlert()
        alert.messageText = "Aster could not open its letter"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    /// Optional, explicit command-line verification used by the local build.
    /// It reports the bundled page's readiness without adding a JavaScript API.
    private func writeSmokeReportIfRequested() {
        guard !smokeReportWritten,
              let flag = CommandLine.arguments.firstIndex(of: "--smoke-report"),
              CommandLine.arguments.indices.contains(flag + 1) else { return }
        smokeReportWritten = true
        let destination = URL(fileURLWithPath: CommandLine.arguments[flag + 1])
        let script = """
        (() => {
          let storage = false;
          try { localStorage.setItem('aster-native-smoke','ok'); storage = localStorage.getItem('aster-native-smoke') === 'ok'; localStorage.removeItem('aster-native-smoke'); } catch (_) {}
          return JSON.stringify({readyState:document.readyState, title:document.title, href:location.href,
            storage, nativeBridge:!!window.webkit?.messageHandlers?.asterNative,
            envelope:!!window.asterEnvelope, bodyBackground:getComputedStyle(document.body).backgroundColor,
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
