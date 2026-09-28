import Foundation
import OSLog

private let hostLog = Logger(subsystem: "studio.sandman.aster", category: "dsh-host")

private final class StopAuthenticationRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// One owned DSH Web process. Native URLSession exchanges DSH's launch URL for
/// an HttpOnly cookie before WebKit ever loads a Host document.
final class DSHHost {
    struct AuthenticatedHost {
        let cleanURL: URL
        let cookies: [HTTPCookie]
    }

    /// Exchange the process token outside WebKit. The first WebKit URL is clean;
    /// neither document scripts nor browser navigation history receive it.
    static func authenticate(_ launchURL: URL,
                             completion: @escaping (Result<AuthenticatedHost, Error>) -> Void) {
        var clean = URLComponents(url: launchURL, resolvingAgainstBaseURL: false)
        clean?.query = nil
        guard let cleanURL = clean?.url else {
            completion(.failure(HostError.authenticationFailed))
            return
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration,
                                 delegate: StopAuthenticationRedirect(), delegateQueue: nil)
        var request = URLRequest(url: launchURL, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = "GET"
        session.dataTask(with: request) { _, response, error in
            defer { session.invalidateAndCancel() }
            if let error { completion(.failure(error)); return }
            guard let response = response as? HTTPURLResponse,
                  response.statusCode == 303,
                  response.value(forHTTPHeaderField: "Location") == "./" else {
                completion(.failure(HostError.authenticationFailed))
                return
            }
            var fields: [String: String] = [:]
            for (name, value) in response.allHeaderFields {
                fields[String(describing: name)] = String(describing: value)
            }
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: fields, for: cleanURL)
            guard !cookies.isEmpty, cookies.allSatisfy({ $0.isHTTPOnly }) else {
                completion(.failure(HostError.authenticationFailed))
                return
            }
            completion(.success(AuthenticatedHost(cleanURL: cleanURL, cookies: cookies)))
        }.resume()
    }

    private static func argument(after option: String) -> String? {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: option),
              arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    static func configuredRepository() -> URL? {
        if CommandLine.arguments.contains("--offline") ||
            ProcessInfo.processInfo.environment["ASTER_OFFLINE"] == "1" ||
            CommandLine.arguments.contains("--smoke-report") { return nil }
        let path = argument(after: "--dsh-repo") ?? ProcessInfo.processInfo.environment["ASTER_DSH_REPO"]
            ?? (NSHomeDirectory() as NSString).appendingPathComponent("Desktop/dsh")
        let repo = URL(fileURLWithPath: path, isDirectory: true).standardizedFileURL
        let manifest = repo.appendingPathComponent("package.json")
        guard FileManager.default.fileExists(atPath: manifest.path) else { return nil }
        return repo
    }

    private let repository: URL
    private let index: URL
    private var process: Process?
    private var stdout: Pipe?
    private var overlay: URL?
    private var pendingLine = ""
    private var readyReceived = false
    private let outputQueue = DispatchQueue(label: "studio.sandman.aster.dsh-output")
    var onReady: ((URL) -> Void)?
    var onExit: ((Int32) -> Void)?

    init(repository: URL, index: URL) {
        self.repository = repository
        self.index = index
    }

    func start() throws {
        let node = try findNode()
        let builtEntry = repository.appendingPathComponent("apps/cli/lib/bin.js")
        let sourceEntry = repository.appendingPathComponent("apps/cli/src/bin.ts")
        let forceSource = CommandLine.arguments.contains("--dsh-source") ||
            ProcessInfo.processInfo.environment["ASTER_DSH_SOURCE"] == "1"
        let useBuilt = !forceSource && FileManager.default.fileExists(atPath: builtEntry.path)
        let entry = useBuilt ? builtEntry : sourceEntry
        guard FileManager.default.fileExists(atPath: entry.path) else {
            throw HostError.missingEntry
        }
        guard FileManager.default.fileExists(atPath: index.path) else {
            throw HostError.missingInterface
        }
        let overlay = try createOverlay()
        self.overlay = overlay

        let process = Process()
        process.executableURL = node
        process.currentDirectoryURL = repository
        process.arguments = (useBuilt ? [] : ["--import", "tsx/esm"]) + [
            "--input-type=module", "--eval", Self.bootstrap,
            entry.path, "--profile", "web", "--patch", overlay.path,
            "--no-open", "--port", "0",
        ]
        var environment = ProcessInfo.processInfo.environment
        let nodeDirectory = node.deletingLastPathComponent().path
        environment["PATH"] = ([nodeDirectory, "/opt/homebrew/bin", "/usr/local/bin",
                                environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"])
            .joined(separator: ":")
        process.environment = environment
        let pipe = Pipe()
        process.standardOutput = pipe
        // DSH records its own startup diagnostics; avoid retaining or displaying
        // arbitrary plugin stderr, which may include credentials.
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        self.process = process
        self.stdout = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty {
                handle.readabilityHandler = nil
                return
            }
            self?.outputQueue.async { [weak self] in
                guard let self else { return }
                self.consumeOutput(data)
            }
        }
        process.terminationHandler = { [weak self] terminated in
            DispatchQueue.main.async { [weak self] in
                self?.finish(exitCode: terminated.terminationStatus)
            }
        }
        do {
            try process.run()
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            try? FileManager.default.removeItem(at: overlay)
            self.overlay = nil
            self.stdout = nil
            self.process = nil
            throw error
        }
        hostLog.notice("Started DSH Web Host (pid \(process.processIdentifier))")
    }

    var isRunning: Bool { process?.isRunning ?? false }

    func stop() {
        guard let process, process.isRunning else { return }
        process.terminate()
    }

    func forceStop() {
        guard let process, process.isRunning else { return }
        kill(process.processIdentifier, SIGKILL)
    }

    private func consumeOutput(_ data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        pendingLine += text
        if pendingLine.count > 16_384 { pendingLine = String(pendingLine.suffix(4096)) }
        while let newline = pendingLine.firstIndex(of: "\n") {
            let line = String(pendingLine[..<newline]).trimmingCharacters(in: .whitespacesAndNewlines)
            pendingLine.removeSubrange(...newline)
            guard !readyReceived else { continue }
            if line == "aster host: scheduler inspection unavailable; preserving profile" {
                hostLog.warning("Scheduler inspection unavailable; keeping the existing DSH profile")
                continue
            }
            guard let url = Self.readyURL(from: line) else {
                if line.hasPrefix("dsh web:") {
                    hostLog.error("DSH printed an invalid readiness URL")
                }
                continue
            }
            readyReceived = true
            DispatchQueue.main.async { [weak self] in
                guard let self, self.isRunning else { return }
                self.onReady?(url)
            }
        }
    }

    /// Accept only DSH's fixed readiness prefix and a tokenized loopback root.
    private static func readyURL(from line: String) -> URL? {
        let prefix = "dsh web: "
        guard line.hasPrefix(prefix) else { return nil }
        let value = String(line.dropFirst(prefix.count).prefix(2048)).split(separator: " ", maxSplits: 1).first
        guard let value, let components = URLComponents(string: String(value)),
              components.scheme == "http", components.host == "127.0.0.1",
              let port = components.port, (1...65535).contains(port),
              components.path == "/", components.user == nil,
              components.password == nil, components.fragment == nil,
              let query = components.queryItems, query.count == 1,
              query[0].name == "token", !(query[0].value ?? "").isEmpty else { return nil }
        return components.url
    }

    private func createOverlay() throws -> URL {
        let encodedPath = String(data: try JSONEncoder().encode(index.path), encoding: .utf8)!
        let contents = """
        - id: web-runtime
          config:
            frontendDistIndex: \(encodedPath)
            openBrowser: false
            printUrl: true
            surfaceContext: true
            trustedHosts: []
        """
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("aster-dsh-\(UUID().uuidString).patch.yml")
        guard FileManager.default.createFile(atPath: url.path,
                                             contents: Data(contents.utf8),
                                             attributes: [.posixPermissions: 0o600]) else {
            throw HostError.overlayCreationFailed
        }
        return url
    }

    /// Inspect the same composed profile that DSH will boot, in the owned Node
    /// process before any plugins start. Only the small Aster overlay is written;
    /// the effective user configuration never leaves memory or reaches stdout.
    /// Existing scheduler rows, including disabled ones, remain user-owned.
    private static let bootstrap = #"""
    import { createRequire } from 'node:module';
    import { dirname, join } from 'node:path';
    import { appendFile } from 'node:fs/promises';
    import { pathToFileURL } from 'node:url';

    const entry = process.argv[1];
    async function schedulerPatch() {
      const require = createRequire(entry);
      const ext = entry.endsWith('.ts') ? '.ts' : '.js';
      const { prepareProfile, homePatchPath, PROFILE_ROOT_FILENAME } =
        await import(pathToFileURL(join(dirname(entry), `profile-boot${ext}`)).href);
      const { renderConfigDump, loadOptionalPatches } =
        await import(require.resolve('@deepseek-ai/dsh-app-boot'));
      const { entryListSchema } =
        await import(require.resolve('@deepseek-ai/cordis-plugin-include'));
      const yaml = require('js-yaml');
      const profile = prepareProfile('web');
      const layers = profile.layers.map(layer => ({ label: layer.packageName, patches: layer.patches }));
      layers.push({ label: profile.patchPath, patches: profile.patches });
      const home = homePatchPath();
      const homePatches = loadOptionalPatches('dsh', home);
      if (homePatches) layers.push({ label: home, patches: homePatches });
      const rows = yaml.load(renderConfigDump('dsh', join(profile.dir, PROFILE_ROOT_FILENAME), layers, () => {}),
                             { schema: entryListSchema });
      const ids = new Set();
      let hasSchedule = false;
      function inspect(entries) {
        if (!Array.isArray(entries)) throw new Error('Invalid profile entries');
        for (const row of entries) {
          if (!row || typeof row !== 'object') throw new Error('Invalid profile entry');
          if (typeof row.id === 'string') ids.add(row.id);
          if (row.name === '@deepseek-ai/dsh-schedule') hasSchedule = true;
          if (row.group && Array.isArray(row.config)) inspect(row.config);
          if (row.name === '@deepseek-ai/cordis-plugin-include') {
            // A separate tree may own a scheduler. Leave that profile intact;
            // do not create a second loader or evaluate dynamic configuration.
            throw new Error('Profile contains another entry tree');
          }
        }
      }
      inspect(rows);
      if (!hasSchedule) {
        let id = 'schedule';
        for (let suffix = 1; ids.has(id); suffix++) id = suffix === 1 ? 'aster-schedule' : `aster-schedule-${suffix}`;
        return '\n' + yaml.dump([{ insert: [{ id, name: '@deepseek-ai/dsh-schedule' }] }]);
      }
      return '';
    }
    let deadline;
    try {
      const patch = await Promise.race([schedulerPatch(), new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Profile inspection timed out')), 5000);
      })]);
      clearTimeout(deadline);
      if (patch) await appendFile(process.argv[process.argv.indexOf('--patch') + 1], patch);
    } catch {
      clearTimeout(deadline);
      // Never emit configuration or an exception that might include credentials.
      // DSH still boots with the user's own profile and the frontend-only overlay.
      process.stdout.write('aster host: scheduler inspection unavailable; preserving profile\n');
    }
    try {
      const { runCli } = await import(pathToFileURL(entry).href);
      await runCli();
    } catch {
      // Profile diagnostics can contain credentials. Report only a fixed failure.
      process.stderr.write('Aster could not start the DSH profile.\n');
      process.exitCode = 1;
    }
    """#

    private func findNode() throws -> URL {
        let environment = ProcessInfo.processInfo.environment
        let paths = [Self.argument(after: "--dsh-node") ?? environment["ASTER_DSH_NODE"],
                     "/opt/homebrew/bin/node", "/usr/local/bin/node",
                     "/usr/bin/node"] + (environment["PATH"] ?? "")
            .split(separator: ":").map { "\($0)/node" }
        for path in paths.compactMap({ $0 }) {
            if FileManager.default.isExecutableFile(atPath: path) {
                return URL(fileURLWithPath: path).standardizedFileURL
            }
        }
        throw HostError.missingNode
    }

    private func finish(exitCode: Int32) {
        stdout?.fileHandleForReading.readabilityHandler = nil
        stdout = nil
        process = nil
        if let overlay { try? FileManager.default.removeItem(at: overlay) }
        overlay = nil
        hostLog.notice("DSH Web Host exited (code \(exitCode))")
        onExit?(exitCode)
    }

    enum HostError: LocalizedError {
        case missingNode, missingEntry, missingInterface, overlayCreationFailed, authenticationFailed

        var errorDescription: String? {
            switch self {
            case .missingNode: return "Node.js was not found. Set ASTER_DSH_NODE to its executable path."
            case .missingEntry: return "The DSH CLI has not been built and its source entry is missing."
            case .missingInterface: return "Aster's packaged Web interface is missing."
            case .overlayCreationFailed: return "Aster could not create the temporary DSH configuration."
            case .authenticationFailed: return "DSH did not issue a valid local browser session."
            }
        }
    }
}
