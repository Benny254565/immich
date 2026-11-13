import { immichEditUrl, isRawAsset, photoshopRawAsset, stackRawAssets } from '#lib/utils/raw-asset.ts';

const asset = (
  id: string,
  fileName: string,
  mimeType?: string,
): { id: string; originalFileName: string; originalPath: string; originalMimeType?: string } => ({
  id,
  originalFileName: fileName,
  originalPath: `/data/library/${fileName}`,
  originalMimeType: mimeType,
});

describe('isRawAsset', () => {
  it('detects camera raw files by extension', () => {
    expect(isRawAsset(asset('1', 'IMG_0001.CR3'))).toBe(true);
    expect(isRawAsset(asset('2', 'IMG_0001.CR2'))).toBe(true);
    expect(isRawAsset(asset('3', 'IMG_0001.dng'))).toBe(true);
    expect(isRawAsset(asset('4', 'IMG_0001.NEF'))).toBe(true);
    expect(isRawAsset(asset('5', 'IMG_0001.ARW'))).toBe(true);
    expect(isRawAsset(asset('6', 'IMG_0001.RAF'))).toBe(true);
  });

  it('does not treat jpeg, heic, or photoshop files as raw', () => {
    expect(isRawAsset(asset('1', 'IMG_0001.JPG', 'image/jpeg'))).toBe(false);
    expect(isRawAsset(asset('2', 'IMG_0001.HEIC', 'image/heic'))).toBe(false);
    expect(isRawAsset(asset('3', 'edit.psd', 'image/vnd.adobe.photoshop'))).toBe(false);
  });

  it('detects raw mime types when the filename has no extension', () => {
    expect(isRawAsset(asset('1', 'IMG_0001', 'image/x-canon-cr3'))).toBe(true);
    expect(isRawAsset(asset('2', 'IMG_0001', 'image/jpeg'))).toBe(false);
  });
});

describe('stack raw selection', () => {
  const jpg = asset('jpg', 'IMG_0001.JPG', 'image/jpeg');
  const cr3 = asset('cr3', 'IMG_0001.CR3', 'image/x-canon-cr3');
  const dng = asset('dng', 'IMG_0002.DNG', 'image/x-adobe-dng');

  it('returns only raw members', () => {
    expect(stackRawAssets([jpg, cr3, dng]).map((item) => item.id)).toEqual(['cr3', 'dng']);
  });

  it('opens the viewed raw, otherwise the first raw in stack order', () => {
    expect(photoshopRawAsset([jpg, cr3, dng], 'jpg')?.id).toBe('cr3');
    expect(photoshopRawAsset([jpg, cr3, dng], 'dng')?.id).toBe('dng');
    expect(photoshopRawAsset([jpg], 'jpg')).toBeUndefined();
  });
});

describe('immichEditUrl', () => {
  it('encodes the asset id and server path', () => {
    expect(
      immichEditUrl({
        id: '019a0b2c-7d3e-7000-8000-000000000001',
        originalPath: '/mnt/Pool1/General/Photos/2024/IMG 0001.CR3',
      }),
    ).toBe(
      'immich-edit://open?assetId=019a0b2c-7d3e-7000-8000-000000000001&path=%2Fmnt%2FPool1%2FGeneral%2FPhotos%2F2024%2FIMG%200001.CR3',
    );
  });
});
