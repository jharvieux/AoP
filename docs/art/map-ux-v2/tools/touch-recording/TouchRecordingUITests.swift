import XCTest

/// Runs only against the deterministic Vite fixture documented in README.md.
/// Every gesture is injected by XCTest into Mobile Safari on an iPhone
/// Simulator. The test never evaluates JavaScript or synthesizes PointerEvent.
final class TouchRecordingUITests: XCTestCase {
    private let mapLabel =
        "World map. Use arrow keys to move the tile cursor and Enter to act on it."
    private let targetLabel = "Known course target at column 10, row 8"
    private let previewText = "Course preview — tap again to set course"
    private let queuedText = "Queued course confirmed — column 10, row 8"
    private var safari: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
    }

    private func element(label: String) -> XCUIElement {
        safari.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    private func element(labelPrefix: String) -> XCUIElement {
        safari.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", labelPrefix))
            .firstMatch
    }

    private func waitUntilEnabled(_ element: XCUIElement, timeout: TimeInterval = 20) {
        let ready = expectation(
            for: NSPredicate(format: "exists == true AND enabled == true"),
            evaluatedWith: element
        )
        wait(for: [ready], timeout: timeout)
    }

    private func attachFrame(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testShippingMapTouchRecording() throws {
        // WebKit appends ", web application" to role="application" labels
        // in the iOS accessibility tree, so preserve the shipping label as
        // the stable prefix instead of matching WebKit's role suffix.
        let map = element(labelPrefix: mapLabel)
        XCTAssertTrue(map.waitForExistence(timeout: 20), "The shipping MapCanvas did not mount")
        XCTAssertTrue(map.isHittable)

        let fit = element(label: "Fit to map")
        let recenter = element(label: "Center on fleet")
        waitUntilEnabled(fit)
        waitUntilEnabled(recenter)

        // One-finger pan through XCTest's real press-and-drag gesture.
        let dragStart = map.coordinate(withNormalizedOffset: CGVector(dx: 0.36, dy: 0.46))
        let dragEnd = map.coordinate(withNormalizedOffset: CGVector(dx: 0.62, dy: 0.46))
        dragStart.press(forDuration: 0.18, thenDragTo: dragEnd)

        // Multitouch through the public XCUIElement API. This is deliberately
        // not two fabricated pointer events or browser-side emulation.
        map.pinch(withScale: 1.35, velocity: 1.0)

        // Exercise the real minimap, fleet-recenter, and whole-board-fit paths.
        let minimap = element(labelPrefix: "Map overview.")
        XCTAssertTrue(minimap.waitForExistence(timeout: 10))
        minimap.tap()
        recenter.tap()
        fit.tap()

        // The fixture reveals this pointer-events:none DOM reticle only after
        // the production 220 ms fit transition has settled. Its centre was
        // computed with shipping fitMapCamera + cellCenter for target (9,7).
        let target = element(label: targetLabel)
        XCTAssertTrue(target.waitForExistence(timeout: 5), "Fit-derived target did not arm")
        let mapFrame = map.frame
        let targetFrame = target.frame
        XCTAssertGreaterThan(mapFrame.width, 0)
        XCTAssertGreaterThan(mapFrame.height, 0)
        XCTAssertTrue(mapFrame.contains(CGPoint(x: targetFrame.midX, y: targetFrame.midY)))

        // Convert DOM geometry to an XCUIElement-normalized canvas coordinate.
        // No screen pixel, device size, or guessed tile position is hardcoded.
        let normalized = CGVector(
            dx: (targetFrame.midX - mapFrame.minX) / mapFrame.width,
            dy: (targetFrame.midY - mapFrame.minY) / mapFrame.height
        )
        XCTAssertGreaterThan(normalized.dx, 0)
        XCTAssertLessThan(normalized.dx, 1)
        XCTAssertGreaterThan(normalized.dy, 0)
        XCTAssertLessThan(normalized.dy, 1)
        let coursePoint = map.coordinate(withNormalizedOffset: normalized)

        coursePoint.tap()
        let preview = element(label: previewText)
        XCTAssertTrue(
            preview.waitForExistence(timeout: 5),
            "First touch did not expose MapCanvas's dynamic course-preview hint"
        )
        XCTAssertFalse(element(label: queuedText).exists)
        attachFrame(named: "01-real-touch-course-preview")

        coursePoint.tap()
        let queued = element(label: queuedText)
        XCTAssertTrue(
            queued.waitForExistence(timeout: 5),
            "Second touch did not reach the supplied onSetCourse callback"
        )
        XCTAssertFalse(
            element(labelPrefix: "Unexpected one-tap map action").exists,
            "The mechanically derived coordinate fell through to onTileClick"
        )
        attachFrame(named: "02-real-touch-course-queued")
    }
}
