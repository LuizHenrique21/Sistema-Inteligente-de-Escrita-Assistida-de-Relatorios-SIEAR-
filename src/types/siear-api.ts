export interface AppInfo {
  name: string
  version: string
  environment: 'development' | 'production'
}

export interface AiGenerateRequest {
  prompt: string
}

export type AiErrorCode =
  | 'INVALID_PROMPT'
  | 'OLLAMA_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNEXPECTED_ERROR'

export interface AiGenerateSuccess {
  ok: true
  content: string
}

export interface AiGenerateFailure {
  ok: false
  error: {
    code: AiErrorCode
    message: string
  }
}

export type AiGenerateResult = AiGenerateSuccess | AiGenerateFailure

export interface SiearApi {
  app: { getInfo: () => Promise<AppInfo> }
  ai: { generate: (request: AiGenerateRequest) => Promise<AiGenerateResult> }
}
