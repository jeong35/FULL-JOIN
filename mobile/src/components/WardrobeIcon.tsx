// 고른 모양까지 반영한 옷 그림(11/19).
// - ItemIcon: 옷장에 넣은 옷 한 벌. 시안 그림을 불러오기 전에는 종류·색·핏 그림(v12)으로 먼저 그린다.
// - LookIcon: 옷 추가 ②에서 지금 고른 값으로 계산한 그림(Look).
import type { Color, Kind, VisualFit } from '@/data/catalog';
import { itemTint } from '@/data/photoColor';
import type { WardrobeItem } from '@/data/types';
import { useWardrobePhoto } from '@/data/wardrobePhotos';
import { lookForItem, useWardrobeArt, type Look } from '@/data/wardrobeLook';

import { KindIcon } from './KindIcon';

type LookIconProps = {
  look: Look | null;
  kind: Kind;
  /** 안 주면 브랜드 연보라(색을 아직 안 골랐을 때) */
  color?: Color | null;
  fit?: VisualFit | null;
  size: number;
  /** 색 이름 대신 칠할 색(사진이 있는 옷의 사진 색감) */
  tint?: string | null;
};

export function LookIcon({ look, kind, color, fit, size, tint }: LookIconProps) {
  if (look === null || look.v12) {
    return (
      <KindIcon
        kind={kind}
        color={color}
        fit={fit}
        size={size}
        pattern={look?.pattern ?? null}
        noWeave={look?.v12 ? look.plainKnit : false}
        tint={tint}
      />
    );
  }
  return (
    <KindIcon
      kind={kind}
      color={color}
      size={size}
      layers={look.layers}
      place={look.place}
      overlay={look.overlay}
      pattern={look.pattern}
      tint={tint}
    />
  );
}

// 사진이 있는 옷은 그림도 사진 색감으로 칠한다(밝기는 색 이름 쪽으로, 11/23). 사람이 색을 바꿨으면 고른 색 그대로(11/25).
export function ItemIcon({ item, size }: { item: WardrobeItem; size: number }) {
  const art = useWardrobeArt();
  const photo = useWardrobePhoto(item.id);
  const look = art ? lookForItem(art, item) : null;
  const tint = itemTint(photo?.color, item.color, item.kind);
  return <LookIcon look={look} kind={item.kind} color={item.color} fit={item.visual_fit} size={size} tint={tint} />;
}
