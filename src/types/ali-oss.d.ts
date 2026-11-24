declare module 'ali-oss' {
  export interface OSSOptions {
    region: string
    endpoint: string
    accessKeyId: string
    accessKeySecret: string
    bucket: string
    secure?: boolean
    timeout?: number
  }

  export interface OSSListQuery {
    prefix?: string
    delimiter?: string
    'max-keys'?: number
    marker?: string
  }

  export interface OSSListObject {
    name: string
    size?: number | string
    lastModified?: string
  }

  export interface OSSListResult {
    objects?: OSSListObject[]
    prefixes?: string[]
    isTruncated?: boolean
    nextMarker?: string
  }

  export interface OSSGetResult {
    content: Buffer
  }

  export default class OSS {
    constructor(options: OSSOptions)
    list(query: OSSListQuery, options?: object): Promise<OSSListResult>
    put(name: string, file: Buffer, options?: { mime?: string }): Promise<unknown>
    multipartUpload(name: string, file: Buffer, options?: { mime?: string }): Promise<unknown>
    get(name: string): Promise<OSSGetResult>
  }
}
