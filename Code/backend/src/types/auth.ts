export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface UserResponse {
  id: string
  email: string
  tenantId: string
  tenantName: string
  role: string
  createdAt: string
}

export interface MeResponse {
  user: UserResponse
  quota: {
    maxSandboxes: number
    maxExecutionSeconds: number
    maxMemoryMb: number
    gpuAccess: boolean
  }
}
