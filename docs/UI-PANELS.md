# Basic optional DOM panels

Import from `rocket-engine-v2/ui` and load `rocket-engine-v2/ui/style.css`. The UI module is opt-in and introduces no runtime service, canvas widget renderer, GUI editor or character framework dependency. Open `ui-panels.html` for native controls and `ui-chat.html` for a complete scripted chat box.

## Panel and simple content

```ts
import { Panel } from 'rocket-engine-v2/ui';

const panel = new Panel({
  target: document.querySelector('#sidebar')!,
  title: 'Cargo',
  closable: true, // default; false omits the close button
  view, // optional; disposing this view disposes its panel
});
panel.append(
  panel.list(['Ore', 'Alloy', 'Parts']),
  panel.table(
    ['Item', 'Stock'],
    [
      ['Ore', '24'],
      ['Alloy', '8'],
    ],
  ),
  panel.grid(['Repair kit', 'Scanner', 'Compass']),
  panel.button('Inspect', () => game.inspectCargo()),
  panel.message('Cargo ready.', 'success'),
);

const name = panel.field('Name', { name: 'name', required: true });
panel.append(
  panel.form([name], (values) => game.rename(String(values.get('name')))),
);
```

Helpers return ordinary DOM elements; append them where needed, or use native HTML directly. Lists/tables/messages render strings as text. Grid cells can contain text or caller-owned DOM nodes. Forms use native validation and FormData; fields support text, email, number and checkbox inputs. Message tones are info, success, warning and error. The caller owns application state, validation and consequences. Button and form handlers submit host commands, not simulation ticks.

Panels are modeless labelled regions, with no focus trap. They can live beside a canvas or in a CSS-positioned overlay host. `close()` hides a reusable panel, `show()` reopens it, and `focus(element?)` focuses a descendant or the panel. Closing restores connected previous focus (or the associated live canvas); it does not pause simulation. `dispose()` removes the panel, its subscriptions and owned listeners. A standalone panel must be explicitly owned/disposed by its caller. `own()` and `on()` attach cleanup/listeners to the panel's lifetime.

Rocket Input already accepts keyboard events only from bound canvases and resets held/fixed input on canvas blur. Native panel focus therefore suppresses gameplay without a second global input router. The panel stops bubbling keyboard events while preserving native control behavior and browser shortcuts. External capture-phase/game handlers must still follow the same focus policy; the panel does not disable unrelated page input. Each view owns only its own presentation.

## Chat presentation contract

```ts
import { ChatBox, Panel, type ChatPort } from 'rocket-engine-v2/ui';

const panel = new Panel({ target: '#chat', title: 'Station chat', view });
const box = new ChatBox(panel, gameConversation as ChatPort);
panel.focus(box.input);
```

ChatPort owns the conversation. `read()` supplies an immutable/read-only ChatSnapshot; `subscribe(listener)` returns an unsubscribe function; `dispatch(command)` submits a host command. Snapshot fields are a stable `sessionId`, monotonic per-session `revision`, messages with stable IDs/speaker/kind/plain text, response choices with IDs/text, pending request ID and an optional correlated error. Commands carry session/request IDs and a send, choose, retry or cancel action. The host validates these commands, suppresses duplicates and controls asynchronous work. Rocket owns no dialogue history, quest progression, AI prompts, inventory or conversation persistence.

ChatBox presents a scrollable log, quick replies, a multiline composer, Send, pending feedback, Cancel reply and Retry reply. Enter sends, Shift+Enter inserts a line, and IME composition does not send prematurely. A draft can be edited while a reply is pending; submission is gated until the host clears pending state. The log follows new messages when already near the bottom and preserves a reader's scroll position otherwise. Content is plain text, never provider-supplied HTML.

One conversation may have several panel presentations. One submit dispatches one command; the host's synchronous pending snapshot gates both windows. Closing a panel detaches its subscription and rejects late callbacks without cancelling another view's conversation. Reopening reads the current host snapshot; closing preserves its local draft. Panel/view disposal releases all listeners and message nodes. Late revisions and replies for replaced sessions are ignored. The game chooses whether to detach or explicitly cancel the conversation; UI closure is not an implicit domain cancellation.

The scripted demo provider owns one bounded 64-message history, request correlation, delayed replies, error injection, retry, cancellation and session replacement. It has no CompanionAI/backend dependency. It is an example provider, not a second character/dialogue framework. Freeform replies are deliberately scripted; a real game's character adapter can supply the same port later.

Tests cover canvas-held-key release on panel focus, close/reopen ownership, late callbacks after closure/disposal/session replacement, shared pending state and single dispatch across views, literal text rendering, cleanup despite host callback errors, and scripted request retry/cancellation. Browser checks cover native forms, focus restoration, chat behavior and view disposal. Dragging/resizing windows, modal stacks, rich text, streaming tokens, virtualization and a theme editor remain separate future decisions.

## Factory inspection integration

`factory-terrain.html?transport=1&workshop=1` uses a terrain-view-owned Building inspection panel. Pick a building/site or use Inspect building; Open inspection panel reopens the current selection after closing it. The panel shows live production, input/output buffers, attendance, routes and removal eligibility, or construction progress and reserved/missing materials.

The original demo controls move into the panel; there is one selection and one command path. Pause/resume, manual on-site attendance, site cancellation, depot supply, drain and idle removal still delegate to FactoryDemo and Workshop. This UI adds no production rules, worker decisions or persistence format. Terrain eviction does not remove a domain building, so inspection can continue while its artwork is offscreen.

Closing the panel leaves selection and simulation intact. Removing/cancelling the selected object clears selection and hides the panel. Closing the terrain view disposes the panel and releases selection while Workshop diagnostics continue; recreation returns the same page-owned command nodes to a fresh panel. Focus inside the panel clears canvas input through the existing blur policy, and closing returns focus to the terrain canvas when available.

## Host command availability

ChatSnapshot may supply `actions` (send/choose/retry/cancel), a plain-text `status`
and a `cancelLabel`. These allow a host to gate new work during authority publication
or uncertainty independently of a pending dialogue. ChatBox checks these gates at
render and dispatch; blocked submission preserves typed input. Omitted actions keep
the established pending/error policy. The host remains the final command authority.
