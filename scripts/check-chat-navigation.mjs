import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const [tabs, chat, rootLayout, result, hint] = await Promise.all([
  read('mobile/src/app/(tabs)/_layout.tsx'),
  read('mobile/src/app/chat.tsx'),
  read('mobile/src/app/_layout.tsx'),
  read('mobile/src/app/result/[id].tsx'),
  read('mobile/src/components/HintBubble.tsx'),
]);

await assert.rejects(access(new URL('mobile/src/app/(tabs)/chat.tsx', root)), /ENOENT/u);
assert.doesNotMatch(tabs, /Tabs\.Screen\s+name=["']chat["']/u);
assert.match(tabs, /router\.push\(["']\/chat["']\)/u);
assert.doesNotMatch(tabs, /router\.navigate\([^\n]*\/chat/u);
assert.match(tabs, /pointerEvents=["']box-none["']/u);
assert.match(tabs, /hitSlop=\{10\}/u);
assert.match(tabs, /zIndex:\s*3[0-9]/u);
assert.match(tabs, /elevation:\s*1[0-9]/u);
for (const name of ['index', 'saved', 'recommend', 'closet', 'my']) {
  assert.match(tabs, new RegExp(`name: ['"]${name}['"]`, 'u'));
}

assert.match(rootLayout, /Stack\.Screen\s+name=["']chat["']/u);
assert.match(chat, /Redirect href=\{hasSeenIntro\(\) \|\| hasLoggedInBefore\(\) \? ['"]\/onboarding\/login['"] : ['"]\/onboarding['"]\}/u);
assert.match(chat, /Redirect href=["']\/onboarding\/taste["']/u);
assert.match(chat, /router\.canGoBack\(\)/u);
assert.match(chat, /router\.back\(\)/u);
assert.match(chat, /router\.replace\(["']\/["']\)/u);
assert.match(result, /router\.push\(\{ pathname: ['"]\/chat['"], params: \{ image: imageId \} \}\)/u);

for (const target of ['/recommend', '/search/results', '/style/[id]', '/result/[id]', '/closet', '/add-item/photo-crop', '/saved', '/add-item/color-fit', '/add-item/kind']) {
  assert.ok(chat.includes(`'${target}'`), `chat action route must remain connected: ${target}`);
}

assert.ok(hint.indexOf('onPress?.()') < hint.indexOf("track('hint_click'"), 'hint primary action must run before analytics');

console.log('Chat navigation checks passed: root Stack route, auth guard, five tabs, overlays, context entry, close fallback, and Action CTA routes.');
