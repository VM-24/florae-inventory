import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Image, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import { CameraOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
import { api, type ItemPhoto } from '../api';

export const MAX_PHOTOS = 20; // mirrors the server limit

interface Props {
  // Existing item: photos are uploaded/deleted right away.
  itemId?: string;
  photos?: ItemPhoto[];
  onChange?: (photos: ItemPhoto[]) => void;
  // New item (no id yet): files are kept here and uploaded by the page after creation.
  pending?: File[];
  onPendingChange?: (files: File[]) => void;
  readOnly?: boolean;
}

type Tile = { key: string; src: string; photoId?: string; pendingIndex?: number };

// Grid of item photos. The first one is the cover shown in lists ("Главное").
// Click a photo to open the viewer (zoom, swipe through all photos).
export default function PhotoGallery({ itemId, photos = [], onChange, pending = [], onPendingChange, readOnly }: Props) {
  const { message } = App.useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // Blob URLs for pending files; revoked when the list changes.
  const pendingUrls = useMemo(() => pending.map(f => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => pendingUrls.forEach(u => URL.revokeObjectURL(u)), [pendingUrls]);

  const tiles: Tile[] = itemId
    ? photos.map(p => ({ key: p.id, src: p.url, photoId: p.id }))
    : pendingUrls.map((src, i) => ({ key: src, src, pendingIndex: i }));
  const free = MAX_PHOTOS - tiles.length;

  const run = async (action: () => Promise<ItemPhoto[]>) => {
    setBusy(true);
    try {
      onChange?.(await action());
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const onPicked = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/'));
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    if (files.length > free) message.warning(`Можно добавить ещё ${free} фото — лишние пропущены`);
    const accepted = files.slice(0, Math.max(free, 0));
    if (!accepted.length) return;
    if (!itemId) { onPendingChange?.([...pending, ...accepted]); return; }
    await run(() => api.uploadItemPhotos(itemId, accepted));
  };

  const remove = (tile: Tile) => {
    if (tile.photoId && itemId) return run(() => api.deleteItemPhoto(itemId, tile.photoId!));
    onPendingChange?.(pending.filter((_, i) => i !== tile.pendingIndex));
  };

  const makeCover = (tile: Tile) => {
    if (tile.photoId && itemId) return run(() => api.setCoverPhoto(itemId, tile.photoId!));
    const i = tile.pendingIndex!;
    onPendingChange?.([pending[i], ...pending.filter((_, j) => j !== i)]);
  };

  return (
    <Card
      size="small"
      title={<span>Фото {tiles.length > 0 && <span className="muted">({tiles.length})</span>}</span>}
      style={{ marginBottom: 16 }}
    >
      {tiles.length === 0 ? (
        <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: '#f5f3f8', borderRadius: 8 }} className="muted">
          Нет фото
        </div>
      ) : (
        <Image.PreviewGroup>
          <div className="photo-grid">
            {tiles.map((tile, index) => (
              <div key={tile.key} className={`photo-tile ${index === 0 ? 'photo-tile-cover' : ''}`}>
                <Image src={tile.src} alt="" width="100%" height="100%" style={{ objectFit: 'cover' }} />
                {index === 0 && <Tag color="purple" className="photo-cover-tag">Главное</Tag>}
                {!readOnly && (
                  <Space size={4} className="photo-actions">
                    {index > 0 && (
                      <Tooltip title="Сделать главным">
                        <Button size="small" icon={<StarOutlined />} disabled={busy} onClick={() => makeCover(tile)} aria-label="Сделать главным" />
                      </Tooltip>
                    )}
                    <Popconfirm title="Удалить фото?" okText="Удалить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => remove(tile)}>
                      <Button size="small" danger icon={<DeleteOutlined />} disabled={busy} aria-label="Удалить фото" />
                    </Popconfirm>
                  </Space>
                )}
              </div>
            ))}
          </div>
        </Image.PreviewGroup>
      )}

      {!readOnly && (
        <Space style={{ marginTop: 12 }} wrap align="center">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => onPicked(e.target.files)} />
          <Button icon={<CameraOutlined />} loading={busy} disabled={free <= 0} onClick={() => fileRef.current?.click()}>
            Добавить фото
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {free > 0 ? `можно выбрать несколько, до ${MAX_PHOTOS}` : `максимум ${MAX_PHOTOS} фото`}
          </Typography.Text>
        </Space>
      )}
    </Card>
  );
}
