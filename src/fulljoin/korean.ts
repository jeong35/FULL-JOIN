export type KoreanParticlePair =
  | "이/가"
  | "은/는"
  | "을/를"
  | "과/와"
  | "으로/로"
  | "이랑/랑"
  | "이라/라"
  | "이에요/예요";

type Ending = { hasFinal: boolean; finalIndex: number };

const PARTICLES: Record<Exclude<KoreanParticlePair, "으로/로">, readonly [string, string]> = {
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "을/를": ["을", "를"],
  "과/와": ["과", "와"],
  "이랑/랑": ["이랑", "랑"],
  "이라/라": ["이라", "라"],
  "이에요/예요": ["이에요", "예요"],
};

const DIGIT_FINALS: Record<string, number> = {
  "0": 21,
  "1": 8,
  "2": 0,
  "3": 16,
  "4": 0,
  "5": 0,
  "6": 1,
  "7": 8,
  "8": 8,
  "9": 0,
};

function endingOf(value: string): Ending | null {
  const trimmed = value.trimEnd();
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const character = trimmed[index];
    if (character === undefined || /\s/u.test(character) || ")]}>〉》」』'\".,!?;:·".includes(character)) continue;

    const code = character.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const finalIndex = (code - 0xac00) % 28;
      return { hasFinal: finalIndex !== 0, finalIndex };
    }
    const digitFinal = DIGIT_FINALS[character];
    if (digitFinal !== undefined) return { hasFinal: digitFinal !== 0, finalIndex: digitFinal };

    // 영문·기호의 실제 발음은 문자열만으로 확정할 수 없다.
    return null;
  }
  return null;
}

export function koreanParticle(value: string, pair: KoreanParticlePair): string | null {
  const ending = endingOf(value);
  if (ending === null) return null;
  if (pair === "으로/로") return ending.hasFinal && ending.finalIndex !== 8 ? "으로" : "로";
  const [withFinal, withoutFinal] = PARTICLES[pair];
  return ending.hasFinal ? withFinal : withoutFinal;
}

// 발음을 확정할 수 없으면 조사를 붙이지 않는다. 호출부는 조사 없는 문장 템플릿을 우선 사용한다.
export function withKoreanParticle(value: string, pair: KoreanParticlePair): string {
  const particle = koreanParticle(value, pair);
  return particle === null ? value.trimEnd() : `${value.trimEnd()}${particle}`;
}
