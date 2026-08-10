import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { randomUUID } from 'node:crypto'
import { storageService } from '../lib/supabase/storage'
import { ArtifactRepo } from '../repositories/artifact.repo'
import { SignedUrlQuerySchema, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../types/storage'
import { ValidationError, NotFoundError } from '../types/common'
import type { HonoEnv } from '../types/common'

export const storageRouter = new Hono<HonoEnv>()
const artifactRepo = new ArtifactRepo()

storageRouter.post('/upload', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')

  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined

  if (!file) throw new ValidationError('Missing file field in multipart body')

  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`MIME type '${mimeType}' is not allowed`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`)
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const storagePath = storageService.tenantPath('uploads', tenantId, userId, filename)

  await storageService.upload('uploads', storagePath, buffer, mimeType)

  const artifact = await artifactRepo.create({
    tenant_id: tenantId,
    user_id: userId,
    sandbox_id: null,
    workflow_id: null,
    storage_path: storagePath,
    artifact_type: 'file',
    mime_type: mimeType,
    size_bytes: buffer.byteLength,
    metadata: { originalName: file.name },
  })

  const signedUrl = await storageService.signedUrl('uploads', storagePath, 900)

  return c.json({ artifactId: artifact.id, storagePath, signedUrl, mimeType }, 201)
})

storageRouter.get('/sign/:path{.+}', zValidator('query', SignedUrlQuerySchema), async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const path = c.req.param('path')
  const { ttl } = c.req.valid('query')

  // Validate ownership via artifact lookup
  const artifacts = await artifactRepo.findByTenantUser(tenantId, userId)
  const owned = artifacts.some((a) => a.storage_path === path)
  if (!owned) throw new NotFoundError('Artifact')

  const bucket = path.includes('/media/') ? 'media' : path.includes('/snapshots/') ? 'snapshots' : 'uploads'
  const signedUrl = await storageService.signedUrl(bucket as any, path, ttl)

  return c.json({ signedUrl })
})

storageRouter.delete('/:path{.+}', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const path = c.req.param('path')

  const storagePath = await artifactRepo.deleteArtifact(path, tenantId)
  const bucket = storagePath.includes('/media/') ? 'media' : 'uploads'
  await storageService.deleteObject(bucket as any, storagePath)

  return c.body(null, 204)
})
