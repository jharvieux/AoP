# City runtime evidence harness

This bounded fixture imports the shipping `CityScreen`, `CityScene`, management panels,
theme provider, content tables, engine state constructors, stylesheet, fonts, and public art
from the checked-out repository. It supplies explicit Pirate city props for the retained
round-1/two-building, round-13/eight-building, and round-54/fourteen-building states. It does
not write browser storage or `GameState`, and it does not replace any shipping component.

The fixture intentionally does not open a panel, change zoom, pan, await fonts/images, or
take a screenshot. Those operations must use the visible shipping controls in the in-app
Browser, followed by visible settling and native-size review. `fixtures.json` is the exact
22-frame recipe; six captures have two targets because the freshly captured bytes are copied
into both evidence sets.

Validate and serve from the repository root:

```bash
node docs/art/city-ui-v2/tools/runtime-harness/check.mjs
AOP_WEB_NODE_MODULES=/absolute/installed/apps/web/node_modules \
  node docs/art/city-ui-v2/tools/runtime-harness/serve.mjs 4613
```

Navigate to `http://127.0.0.1:4613/?capture=<id>`. Before each screenshot, set the declared
viewport, use the visible building/zoom/pan controls required by that record, wait for a
visibly settled frame, and verify the root document's `data-evidence-*` attributes match the
requested state. Capture screenshot pixels only; browser chrome is out of scope.
