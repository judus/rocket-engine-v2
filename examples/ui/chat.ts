import { Panel, ChatBox } from '../../src/ui/index.js';
import { playground } from './Playground.js';
import { ScriptedChat } from './ScriptedChat.js';
const { app, scene, views } = playground();
const provider = scene.own(new ScriptedChat());
const panels = views.map(
  (view, index) =>
    new Panel({
      target: index === 0 ? '#chat-one' : '#chat-two',
      title: index === 0 ? 'Station chat' : 'Same conversation · second view',
      view,
    }),
);
const boxes = panels.map((panel) => new ChatBox(panel, provider));
const listeners = new AbortController();
scene.own(() => {
  listeners.abort();
});
panels.forEach((panel, index) => {
  document.querySelector(`#open-chat-${index + 1}`)!.addEventListener(
    'click',
    () => {
      panel.show();
      panel.focus(boxes[index]!.input);
    },
    { signal: listeners.signal },
  );
});
document.querySelector('#fail-reply')!.addEventListener(
  'click',
  () => {
    provider.failNext();
    document.querySelector('#chat-proof')!.textContent =
      'Next reply will fail. Use Retry reply after the error.';
  },
  { signal: listeners.signal },
);
document.querySelector('#new-session')!.addEventListener(
  'click',
  () => {
    provider.reset();
  },
  { signal: listeners.signal },
);
document
  .querySelector<HTMLButtonElement>('#dispose-second-view')!
  .addEventListener(
    'click',
    (event) => {
      views[1]!.dispose();
      (event.currentTarget as HTMLButtonElement).disabled = true;
      document.querySelector<HTMLButtonElement>('#open-chat-2')!.disabled =
        true;
    },
    { signal: listeners.signal },
  );
const updateProof = () => {
  document.querySelector('#chat-proof')!.textContent =
    `Session ${provider.read().sessionId} · ${provider.commands} commands received · ${panels.filter((panel) => panel.shown).length} attached chat panels. Closing a panel detaches its presentation; the shared conversation continues.`;
};
const unsubscribe = provider.subscribe(updateProof);
scene.own(() => {
  unsubscribe();
});
panels.forEach((panel) => {
  const detach = panel.observeVisibility(updateProof);
  scene.own(() => {
    detach();
  });
});
updateProof();
void app.start();
