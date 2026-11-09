// 홈 피드 순서(SPEC AC15): 처음 고른 취향 스타일 사진 → 이웃 스타일 사진 → 나머지.
// 묶음 안에서는 스타일 목록 순서대로 한 장씩 돌아가며 놓는다. 서버 src/fulljoin/feed.ts의 orderHomeFeed와 같은 규칙이다.
// 취향 저장 API가 생기기 전까지는 취향을 기기에 두고 여기서 순서를 정한다(같은 스타일 안에서는 서버가 준 순서).
import { STYLES, type Style } from './catalog';
import type { StyleImage } from './types';

// 이웃 스타일 표(10/13 팀 결정, SPEC 피드 구성). 서버 src/fulljoin/catalog.ts NEIGHBOR_STYLES와 같다.
export const NEIGHBOR_STYLES: Record<Style, readonly Style[]> = {
  캐주얼: ['스트릿', '스포티'],
  미니멀: ['시크', '청순'],
  러블리: ['청순', '프레피'],
  청순: ['러블리', '미니멀'],
  엘레강스: ['미니멀', '글램'],
  시크: ['미니멀', '글램'],
  스트릿: ['캐주얼', '스포티'],
  레트로: ['캐주얼', '프레피'],
  프레피: ['러블리', '레트로'],
  스포티: ['캐주얼', '스트릿'],
  글램: ['시크', '엘레강스'],
};

function roundRobin(images: readonly StyleImage[], styles: readonly Style[]): StyleImage[] {
  const queues = styles.map((style) => images.filter((image) => image.style.includes(style)));
  const placed = new Set<string>();
  const result: StyleImage[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.find((image) => !placed.has(image.id));
      if (next !== undefined) {
        placed.add(next.id);
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

export function orderByTaste(images: readonly StyleImage[], taste: readonly Style[]): readonly StyleImage[] {
  if (taste.length === 0) return images; // 취향이 없으면 서버가 준 순서 그대로
  const preferred = new Set<Style>(taste);
  const neighbors = new Set<Style>(taste.flatMap((style) => NEIGHBOR_STYLES[style]));
  const inGroup = (image: StyleImage, group: Set<Style>) => image.style.some((style) => group.has(style));

  const preferredImages = images.filter((image) => inGroup(image, preferred));
  const neighborImages = images.filter((image) => !inGroup(image, preferred) && inGroup(image, neighbors));
  const otherImages = images.filter((image) => !inGroup(image, preferred) && !inGroup(image, neighbors));

  const ordered = [
    ...roundRobin(preferredImages, STYLES.filter((style) => preferred.has(style))),
    ...roundRobin(neighborImages, STYLES.filter((style) => neighbors.has(style))),
    ...roundRobin(otherImages, STYLES.filter((style) => !preferred.has(style) && !neighbors.has(style))),
  ];
  // 스타일이 없는 사진도 빠지지 않게 뒤에 붙인다.
  const seen = new Set(ordered.map((image) => image.id));
  return [...ordered, ...images.filter((image) => !seen.has(image.id))];
}
