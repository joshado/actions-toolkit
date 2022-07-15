import {downloadCache, getCacheVersion, localCachePath} from '../src/internal/cacheHttpClient'
import {CompressionMethod} from '../src/internal/constants'
import * as downloadUtils from '../src/internal/downloadUtils'
import {DownloadOptions, getDownloadOptions} from '../src/options'
import * as os from 'os'
import {promises as fs} from 'fs'
import * as path from 'path'

jest.mock('../src/internal/downloadUtils')

test('getCacheVersion with one path returns version', async () => {
  const paths = ['node_modules']
  const result = getCacheVersion(paths)
  expect(result).toEqual(
    'b3e0c6cb5ecf32614eeb2997d905b9c297046d7cbf69062698f25b14b4cb0985'
  )
})

test('getCacheVersion with multiple paths returns version', async () => {
  const paths = ['node_modules', 'dist']
  const result = getCacheVersion(paths)
  expect(result).toEqual(
    '165c3053bc646bf0d4fac17b1f5731caca6fe38e0e464715c0c3c6b6318bf436'
  )
})

test('getCacheVersion with zstd compression returns version', async () => {
  const paths = ['node_modules']
  const result = getCacheVersion(paths, CompressionMethod.Zstd)

  expect(result).toEqual(
    '273877e14fd65d270b87a198edbfa2db5a43de567c9a548d2a2505b408befe24'
  )
})

test('getCacheVersion with gzip compression does not change vesion', async () => {
  const paths = ['node_modules']
  const result = getCacheVersion(paths, CompressionMethod.Gzip)

  expect(result).toEqual(
    'b3e0c6cb5ecf32614eeb2997d905b9c297046d7cbf69062698f25b14b4cb0985'
  )
})

test('downloadCache uses http-client for non-Azure URLs', async () => {
  const downloadCacheHttpClientMock = jest.spyOn(
    downloadUtils,
    'downloadCacheHttpClient'
  )
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )

  const archiveLocation = 'http://www.actionscache.test/download'
  const archivePath = '/foo/bar'

  await downloadCache(archiveLocation, archivePath)

  expect(downloadCacheHttpClientMock).toHaveBeenCalledTimes(1)
  expect(downloadCacheHttpClientMock).toHaveBeenCalledWith(
    archiveLocation,
    archivePath
  )

  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(0)
})

test('downloadCache uses storage SDK for Azure storage URLs', async () => {
  const downloadCacheHttpClientMock = jest.spyOn(
    downloadUtils,
    'downloadCacheHttpClient'
  )
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )

  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const archivePath = '/foo/bar'

  await downloadCache(archiveLocation, archivePath)

  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(1)
  expect(downloadCacheStorageSDKMock).toHaveBeenCalledWith(
    archiveLocation,
    archivePath,
    getDownloadOptions()
  )

  expect(downloadCacheHttpClientMock).toHaveBeenCalledTimes(0)
})

test('downloadCache passes options to download methods', async () => {
  const downloadCacheHttpClientMock = jest.spyOn(
    downloadUtils,
    'downloadCacheHttpClient'
  )
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )

  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const archivePath = '/foo/bar'
  const options: DownloadOptions = {downloadConcurrency: 4}

  await downloadCache(archiveLocation, archivePath, options)

  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(1)
  expect(downloadCacheStorageSDKMock).toHaveBeenCalled()
  expect(downloadCacheStorageSDKMock).toHaveBeenCalledWith(
    archiveLocation,
    archivePath,
    getDownloadOptions(options)
  )

  expect(downloadCacheHttpClientMock).toHaveBeenCalledTimes(0)
})

test('downloadCache uses http-client when overridden', async () => {
  const downloadCacheHttpClientMock = jest.spyOn(
    downloadUtils,
    'downloadCacheHttpClient'
  )
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )

  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const archivePath = '/foo/bar'
  const options: DownloadOptions = {useAzureSdk: false}

  await downloadCache(archiveLocation, archivePath, options)

  expect(downloadCacheHttpClientMock).toHaveBeenCalledTimes(1)
  expect(downloadCacheHttpClientMock).toHaveBeenCalledWith(
    archiveLocation,
    archivePath
  )

  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(0)
})

async function setupLocalCache(): Promise<string> {
  const localRoot = path.join(os.tmpdir(), "localRoot")
  await fs.rmdir(localRoot, {recursive: true})
  await fs.mkdir(localRoot, {recursive: true})
  return localRoot
}

test('downloadCache returns the file from the local filesystem if present', async () => {
  const downloadCacheHttpClientMock = jest.spyOn(
    downloadUtils,
    'downloadCacheHttpClient'
  )
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )

  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const localRoot = await setupLocalCache()
  const archivePath = path.join(localRoot, "archivePath")

  const options: DownloadOptions = {localCacheRoot: localRoot}
  const localPath = localCachePath(archiveLocation, options) as string
  expect(localPath).not.toBeNull()

  await fs.writeFile(localPath, "I am some cached data")

  await downloadCache(archiveLocation, archivePath, options)

  expect(downloadCacheHttpClientMock).toHaveBeenCalledTimes(0)
  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(0)

  let data = await fs.readFile(archivePath, 'utf8')
  expect(data).toEqual("I am some cached data")
})

test('downloadCache updates the modification timestamp when downloading', async () => {
  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const localRoot = await setupLocalCache()
  const archivePath = path.join(localRoot, "archivePath")

  const options: DownloadOptions = {localCacheRoot: localRoot}
  const localPath = localCachePath(archiveLocation, options) as string
  expect(localPath).not.toBeNull()

  await fs.writeFile(localPath, "I am some cached data")
  const ms = new Date()
  ms.setDate(ms.getDate() - 1)
  await fs.utimes(localPath, ms, ms)

  const oldStat = await fs.stat(localPath)

  await downloadCache(archiveLocation, archivePath, options)
  const newStat = await fs.stat(localPath)
  expect(newStat.mtimeMs).toBeGreaterThan(oldStat.mtimeMs)
})

test('downloadCache uses the HTTP client as normal for a local cache miss', async () => {
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  )
  console.log("cache miss?")
  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'

  const localRoot = await setupLocalCache()
  const archivePath = path.join(localRoot, "archivePath")

  const options: DownloadOptions = {localCacheRoot: localRoot}
  const localPath = localCachePath(archiveLocation, options) as string
  expect(localPath).not.toBeNull()

  await downloadCache(archiveLocation, archivePath, options)
  expect(downloadCacheStorageSDKMock).toHaveBeenCalledTimes(1)
})

test('downloadCache stores the file in the local cache after a cache miss', async () => {
  const downloadCacheStorageSDKMock = jest.spyOn(
    downloadUtils,
    'downloadCacheStorageSDK'
  ).mockImplementation(async (archiveLocation, archivePath, options) => {
    await fs.writeFile(archivePath, "I am the data that was just downloaded")
  })

  const archiveLocation = 'http://foo.blob.core.windows.net/bar/baz'
  const localRoot = await setupLocalCache()
  const archivePath = path.join(localRoot, "archivePath")

  const options: DownloadOptions = {localCacheRoot: localRoot}
  const localPath = localCachePath(archiveLocation, options) as string
  expect(localPath).not.toBeNull()

  await downloadCache(archiveLocation, archivePath, options)

  expect(await fs.readFile(localPath, 'utf8')).toEqual("I am the data that was just downloaded")
})
