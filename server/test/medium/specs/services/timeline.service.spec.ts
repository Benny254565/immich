import { BadRequestException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { AssetOrderBy, AssetVisibility, SharedLinkType } from 'src/enum.js';
import { AccessRepository } from 'src/repositories/access.repository.js';
import { AssetRepository } from 'src/repositories/asset.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PartnerRepository } from 'src/repositories/partner.repository.js';
import { SharedLinkRepository } from 'src/repositories/shared-link.repository.js';
import { DB } from 'src/schema/index.js';
import { TimelineService } from 'src/services/timeline.service.js';
import { newMediumService } from 'test/medium.factory.js';
import { factory } from 'test/small.factory.js';
import { getKyselyDB } from 'test/utils.js';

let defaultDatabase: Kysely<DB>;

// eslint-disable-next-line unicorn/no-unnecessary-parameters
const setup = (db?: Kysely<DB>) => {
  return newMediumService(TimelineService, {
    database: db || defaultDatabase,
    real: [AssetRepository, AccessRepository, PartnerRepository],
    mock: [LoggingRepository],
  });
};

beforeAll(async () => {
  defaultDatabase = await getKyselyDB();
});

describe(TimelineService.name, () => {
  describe('getTimeBuckets', () => {
    it('should get time buckets by month', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const auth = factory.auth({ user });
      const dates = [new Date('1970-01-01'), new Date('1970-02-10'), new Date('1970-02-11'), new Date('1970-02-11')];
      for (const localDateTime of dates) {
        const { asset } = await ctx.newAsset({ ownerId: user.id, localDateTime });
        await ctx.newExif({ assetId: asset.id, make: 'Canon' });
      }

      const response = sut.getTimeBuckets(auth, {});
      await expect(response).resolves.toEqual([
        { count: 3, timeBucket: '1970-02-01' },
        { count: 1, timeBucket: '1970-01-01' },
      ]);
    });

    it('should return error if time bucket is requested with partners asset and archived', async () => {
      const { sut } = setup();
      const auth = factory.auth();
      const response1 = sut.getTimeBuckets(auth, { withPartners: true, visibility: AssetVisibility.Archive });
      await expect(response1).rejects.toBeInstanceOf(BadRequestException);
      await expect(response1).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );

      const response2 = sut.getTimeBuckets(auth, { withPartners: true, visibility: AssetVisibility.Hidden });
      await expect(response2).rejects.toBeInstanceOf(BadRequestException);
      await expect(response2).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );
    });

    it('should default to timeline visibility if time bucket is requested with partners assets', async () => {
      const { sut } = setup();
      const auth = factory.auth();
      await expect(sut.getTimeBuckets(auth, { withPartners: true })).resolves.toEqual([]);
    });

    it('should return error if time bucket is requested with partners asset and favorite', async () => {
      const { sut } = setup();
      const auth = factory.auth();
      const response1 = sut.getTimeBuckets(auth, { withPartners: true, isFavorite: false });
      await expect(response1).rejects.toBeInstanceOf(BadRequestException);
      await expect(response1).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );

      const response2 = sut.getTimeBuckets(auth, { withPartners: true, isFavorite: true });
      await expect(response2).rejects.toBeInstanceOf(BadRequestException);
      await expect(response2).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );
    });

    it('should return error if time bucket is requested with partners asset and trash', async () => {
      const { sut } = setup();
      const auth = factory.auth();
      const response = sut.getTimeBuckets(auth, { withPartners: true, isTrashed: true });
      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );
    });

    it('should return error if time bucket is requested with locked visibility for partner', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { user: partner } = await ctx.newUser();
      await ctx.newPartner({ sharedById: partner.id, sharedWithId: user.id });

      const auth = factory.auth({ user, session: { hasElevatedPermission: true } });

      const response = sut.getTimeBuckets(auth, { userId: partner.id, visibility: AssetVisibility.Locked });
      await expect(response).rejects.toThrow(
        'Only non-archived, non-trashed, non-favorited, non-locked assets can be requested for other users',
      );
    });

    it('should not allow access for unrelated shared links', async () => {
      const { sut } = setup();
      const auth = factory.auth({ sharedLink: {} });
      const response = sut.getTimeBuckets(auth, {});
      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Not found or no timeline.read access');
    });
  });

  describe('getTimeBucket', () => {
    it('should return time bucket', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        localDateTime: new Date('1970-02-12'),
        deletedAt: new Date(),
      });
      await ctx.newExif({ assetId: asset.id, make: 'Canon' });
      const auth = factory.auth({ user: { id: user.id } });
      const rawResponse = await sut.getTimeBucket(auth, { timeBucket: '1970-02-01', isTrashed: true });
      const response = JSON.parse(rawResponse);
      expect(response).toEqual(expect.objectContaining({ isTrashed: [true] }));
    });

    it('should handle a bucket without any assets', async () => {
      const { sut } = setup();
      const rawResponse = await sut.getTimeBucket(factory.auth(), { timeBucket: '1970-02-01' });
      const response = JSON.parse(rawResponse);
      expect(response).toEqual({
        city: [],
        country: [],
        createdAt: [],
        duration: [],
        id: [],
        visibility: [],
        isFavorite: [],
        isImage: [],
        isTrashed: [],
        livePhotoVideoId: [],
        fileCreatedAt: [],
        localOffsetHours: [],
        ownerId: [],
        projectionType: [],
        ratio: [],
        status: [],
        thumbhash: [],
      });
    });

    it('should handle 5 digit years', async () => {
      const { sut } = setup();
      const rawResponse = await sut.getTimeBucket(factory.auth(), { timeBucket: '012345-01-01' });
      const response = JSON.parse(rawResponse);
      expect(response).toEqual(expect.objectContaining({ id: [] }));

      const createdAtResponse = await sut.getTimeBucket(factory.auth(), {
        timeBucket: '012345-01-01',
        orderBy: AssetOrderBy.CreatedAt,
      });
      expect(JSON.parse(createdAtResponse)).toEqual(expect.objectContaining({ id: [] }));
    });

    it('should bucket by upload month when ordering by createdAt', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });
      const dates = [
        '1970-01-31T23:59:59.999Z',
        '1970-02-01T00:00:00.000Z',
        '1970-02-28T23:59:59.999Z',
        '1970-03-01T00:00:00.000Z',
      ];
      const ids: string[] = [];
      for (const createdAt of dates) {
        const { asset } = await ctx.newAsset({ ownerId: user.id, createdAt, localDateTime: new Date('2000-01-01') });
        await ctx.newExif({ assetId: asset.id, make: 'Canon' });
        ids.push(asset.id);
      }

      const rawResponse = await sut.getTimeBucket(auth, { timeBucket: '1970-02-01', orderBy: AssetOrderBy.CreatedAt });
      const response = JSON.parse(rawResponse);
      expect(response.id).toEqual([ids[2], ids[1]]);
    });

    it('should return time bucket in trash', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const { asset } = await ctx.newAsset({
        ownerId: user.id,
        localDateTime: new Date('1970-02-12'),
        deletedAt: new Date(),
      });
      await ctx.newExif({ assetId: asset.id, make: 'Canon' });
      const auth = factory.auth({ user: { id: user.id } });
      const rawResponse = await sut.getTimeBucket(auth, { timeBucket: '1970-02-01', isTrashed: true });
      const response = JSON.parse(rawResponse);
      expect(response).toEqual(expect.objectContaining({ isTrashed: [true] }));
    });

    it('should return false for favorite status unless asset owner', async () => {
      const { sut, ctx } = setup();
      const [{ asset: asset1 }, { asset: asset2 }] = await Promise.all([
        ctx.newUser().then(async ({ user }) => {
          const result = await ctx.newAsset({
            ownerId: user.id,
            fileCreatedAt: new Date('1970-02-12'),
            localDateTime: new Date('1970-02-12'),
            isFavorite: true,
          });
          await ctx.newExif({ assetId: result.asset.id, make: 'Canon' });
          return result;
        }),

        ctx.newUser().then(async ({ user }) => {
          const result = await ctx.newAsset({
            ownerId: user.id,
            fileCreatedAt: new Date('1970-02-13'),
            localDateTime: new Date('1970-02-13'),
            isFavorite: true,
          });
          await ctx.newExif({ assetId: result.asset.id, make: 'Canon' });
          return result;
        }),
      ]);

      await Promise.all([
        ctx.newPartner({ sharedById: asset1.ownerId, sharedWithId: asset2.ownerId }),
        ctx.newPartner({ sharedById: asset2.ownerId, sharedWithId: asset1.ownerId }),
      ]);

      const auth1 = factory.auth({ user: { id: asset1.ownerId } });
      const rawResponse1 = await sut.getTimeBucket(auth1, {
        timeBucket: '1970-02-01',
        withPartners: true,
        visibility: AssetVisibility.Timeline,
      });
      const response1 = JSON.parse(rawResponse1);
      expect(response1).toEqual(expect.objectContaining({ id: [asset2.id, asset1.id], isFavorite: [false, true] }));

      const auth2 = factory.auth({ user: { id: asset2.ownerId } });
      const rawResponse2 = await sut.getTimeBucket(auth2, {
        timeBucket: '1970-02-01',
        withPartners: true,
        visibility: AssetVisibility.Timeline,
      });
      const response2 = JSON.parse(rawResponse2);
      expect(response2).toEqual(expect.objectContaining({ id: [asset2.id, asset1.id], isFavorite: [true, false] }));
    });
  });

  it('should strip geodata metadata if shared link without exif', async () => {
    const { sut, ctx } = setup();
    const sharedLinkRepo = ctx.get(SharedLinkRepository);

    const { user } = await ctx.newUser();
    const { asset } = await ctx.newAsset({
      ownerId: user.id,
      localDateTime: new Date('1970-02-12'),
      deletedAt: new Date(),
    });
    const { album } = await ctx.newAlbum({ ownerId: user.id });
    await ctx.newAlbumAsset({ albumId: album.id, assetId: asset.id });

    const { id: sharedLinkId } = await sharedLinkRepo.create({
      allowUpload: false,
      key: Buffer.from('123'),
      type: SharedLinkType.Album,
      userId: user.id,
      albumId: album.id,
    });

    await ctx.newExif({ assetId: asset.id, city: 'Austin', country: 'USA' });
    const auth = factory.auth({ sharedLink: { id: sharedLinkId, showExif: false } });
    const rawResponse = await sut.getTimeBucket(auth, { albumId: album.id, timeBucket: '1970-02-01', isTrashed: true });
    const response = JSON.parse(rawResponse);
    expect(response).not.toEqual(expect.objectContaining({ city: expect.any(Array), country: expect.any(Array) }));
  });

  describe('album stacks', () => {
    it('keeps a stack member visible when its primary is not in the album', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });
      const { album } = await ctx.newAlbum({ ownerId: user.id });

      const makeAsset = async (originalFileName: string, localDateTime: string, deletedAt?: Date) => {
        const { asset } = await ctx.newAsset({
          ownerId: user.id,
          originalFileName,
          localDateTime: new Date(localDateTime),
          deletedAt,
        });
        await ctx.newExif({ assetId: asset.id, make: 'Canon' });
        return asset;
      };

      const jpgInAlbum = await makeAsset('paired.jpg', '1970-02-10T00:00:00.000Z');
      const rawInAlbum = await makeAsset('paired.cr3', '1970-02-11T00:00:00.000Z');
      const jpgOutside = await makeAsset('outside.jpg', '1970-02-12T00:00:00.000Z');
      const rawAlone = await makeAsset('alone.cr3', '1970-02-13T00:00:00.000Z');
      const loose = await makeAsset('loose.jpg', '1970-02-14T00:00:00.000Z');
      const trashedPrimary = await makeAsset('trashed.jpg', '1970-02-15T00:00:00.000Z', new Date());
      const rawWithTrashedPrimary = await makeAsset('trashed.cr3', '1970-02-16T00:00:00.000Z');

      await ctx.newStack({ ownerId: user.id }, [jpgInAlbum.id, rawInAlbum.id]);
      await ctx.newStack({ ownerId: user.id }, [jpgOutside.id, rawAlone.id]);
      await ctx.newStack({ ownerId: user.id }, [trashedPrimary.id, rawWithTrashedPrimary.id]);

      for (const assetId of [
        jpgInAlbum.id,
        rawInAlbum.id,
        rawAlone.id,
        loose.id,
        trashedPrimary.id,
        rawWithTrashedPrimary.id,
      ]) {
        await ctx.newAlbumAsset({ albumId: album.id, assetId });
      }

      const albumBucket = JSON.parse(
        await sut.getTimeBucket(auth, { albumId: album.id, timeBucket: '1970-02-01', withStacked: true }),
      );
      expect(albumBucket.id).toEqual([rawWithTrashedPrimary.id, loose.id, rawAlone.id, jpgInAlbum.id]);

      await expect(sut.getTimeBuckets(auth, { albumId: album.id, withStacked: true })).resolves.toEqual([
        { count: 4, timeBucket: '1970-02-01' },
      ]);

      const expandedAlbum = JSON.parse(await sut.getTimeBucket(auth, { albumId: album.id, timeBucket: '1970-02-01' }));
      expect(expandedAlbum.id).toEqual([rawWithTrashedPrimary.id, loose.id, rawAlone.id, rawInAlbum.id, jpgInAlbum.id]);

      const timelineBucket = JSON.parse(await sut.getTimeBucket(auth, { timeBucket: '1970-02-01', withStacked: true }));
      expect(timelineBucket.id).toEqual([loose.id, jpgOutside.id, jpgInAlbum.id]);
    });

    it('keeps a lone member in tag, archive, locked, and person views', async () => {
      const { sut, ctx } = setup();
      const { user } = await ctx.newUser();
      const auth = factory.auth({ user: { id: user.id } });
      const elevated = factory.auth({ user: { id: user.id }, session: { hasElevatedPermission: true } });

      const make = async (name: string, day: string, extra: { visibility?: AssetVisibility } = {}) => {
        const { asset } = await ctx.newAsset({
          ownerId: user.id,
          originalFileName: name,
          localDateTime: new Date(`1970-03-${day}T00:00:00.000Z`),
          ...extra,
        });
        await ctx.newExif({ assetId: asset.id, make: 'Canon' });
        return asset;
      };

      const tagJpg = await make('tag.jpg', '10');
      const tagRaw = await make('tag.cr3', '11');
      const tagOutside = await make('tag-out.jpg', '12');
      const tagAlone = await make('tag-alone.cr3', '13');
      await ctx.newStack({ ownerId: user.id }, [tagJpg.id, tagRaw.id]);
      await ctx.newStack({ ownerId: user.id }, [tagOutside.id, tagAlone.id]);
      const { tag } = await ctx.newTag({ userId: user.id, value: 'raw' });
      await ctx.newTagAsset({ tagIds: [tag.id], assetIds: [tagJpg.id, tagRaw.id, tagAlone.id] });
      const tagBucket = JSON.parse(
        await sut.getTimeBucket(auth, { tagId: tag.id, timeBucket: '1970-03-01', withStacked: true }),
      );
      expect(tagBucket.id).toEqual([tagAlone.id, tagJpg.id]);

      const archiveJpg = await make('arch.jpg', '14', { visibility: AssetVisibility.Archive });
      const archiveRaw = await make('arch.cr3', '15', { visibility: AssetVisibility.Archive });
      const archiveOutside = await make('arch-out.jpg', '16');
      const archiveAlone = await make('arch-alone.cr3', '17', { visibility: AssetVisibility.Archive });
      await ctx.newStack({ ownerId: user.id }, [archiveJpg.id, archiveRaw.id]);
      await ctx.newStack({ ownerId: user.id }, [archiveOutside.id, archiveAlone.id]);
      const archiveBucket = JSON.parse(
        await sut.getTimeBucket(auth, {
          visibility: AssetVisibility.Archive,
          timeBucket: '1970-03-01',
          withStacked: true,
        }),
      );
      expect(archiveBucket.id).toEqual([archiveAlone.id, archiveJpg.id]);

      const lockedJpg = await make('lock.jpg', '18', { visibility: AssetVisibility.Locked });
      const lockedRaw = await make('lock.cr3', '19', { visibility: AssetVisibility.Locked });
      const lockedOutside = await make('lock-out.jpg', '20');
      const lockedAlone = await make('lock-alone.cr3', '21', { visibility: AssetVisibility.Locked });
      await ctx.newStack({ ownerId: user.id }, [lockedJpg.id, lockedRaw.id]);
      await ctx.newStack({ ownerId: user.id }, [lockedOutside.id, lockedAlone.id]);
      const lockedBucket = JSON.parse(
        await sut.getTimeBucket(elevated, {
          visibility: AssetVisibility.Locked,
          timeBucket: '1970-03-01',
          withStacked: true,
        }),
      );
      expect(lockedBucket.id).toEqual([lockedAlone.id, lockedJpg.id]);

      const { person } = await ctx.newPerson({ ownerId: user.id });
      const personJpg = await make('person.jpg', '22');
      const personRaw = await make('person.cr3', '23');
      const personOutside = await make('person-out.jpg', '24');
      const personAlone = await make('person-alone.cr3', '25');
      await ctx.newStack({ ownerId: user.id }, [personJpg.id, personRaw.id]);
      await ctx.newStack({ ownerId: user.id }, [personOutside.id, personAlone.id]);
      await ctx.newAssetFace({ assetId: personJpg.id, personGroupId: person.personGroupId });
      await ctx.newAssetFace({ assetId: personRaw.id, personGroupId: person.personGroupId });
      await ctx.newAssetFace({ assetId: personAlone.id, personGroupId: person.personGroupId });
      const personBucket = JSON.parse(
        await sut.getTimeBucket(auth, {
          personId: person.personGroupId,
          visibility: AssetVisibility.Timeline,
          timeBucket: '1970-03-01',
          withStacked: true,
        }),
      );
      expect(personBucket.id).toEqual([personAlone.id, personJpg.id]);
    });
  });
});
