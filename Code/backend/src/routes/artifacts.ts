import { Hono } from 'hono'
import { storageService } from '../lib/supabase/storage'
import { ArtifactRepo } from '../repositories/artifact.repo'
import { NotFoundError } from '../types/common'
import type { HonoEnv } from '../types/common'

export const artifactsRouter = new Hono<HonoEnv>()
const repo = new ArtifactRepo()

artifactsRouter.get('/', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const artifacts = await repo.findByTenantUser(tenantId, userId)
  return c.json({ data: artifacts })
})

artifactsRouter.get('/:id', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const artifacts = await repo.findByTenantUser(tenantId, userId)
  const artifact = artifacts.find((a) => a.id === c.req.param('id'))
  if (!artifact) throw new NotFoundError('Artifact')

  const bucket = artifact.storage_path.includes('/media/') ? 'media' : 'uploads'
  const signedUrl = await storageService.signedUrl(bucket as any, artifact.storage_path, 900)

  return c.json({ ...artifact, signedUrl })
})

artifactsRouter.delete('/:id', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const artifacts = await repo.findByTenantUser(tenantId, userId)
  const artifact = artifacts.find((a) => a.id === c.req.param('id'))
  if (!artifact) throw new NotFoundError('Artifact')

  await repo.deleteArtifact(artifact.id, tenantId)
  const bucket = artifact.storage_path.includes('/media/') ? 'media' : 'uploads'
  await storageService.deleteObject(bucket as any, artifact.storage_path).catch(() => {})

  return c.body(null, 204)
})
