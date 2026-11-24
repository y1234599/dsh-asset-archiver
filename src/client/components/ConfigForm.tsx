import React from 'react'

import type { ConfigView } from '../../shared/contract.js'
import { request } from '../api.js'
import { S } from '../styles.js'
import { Banner, type BannerMessage } from './Banner.js'
import { Button } from './Button.js'

interface ConfigFormProps {
  config: ConfigView
  onSaved: (view: ConfigView) => void
}

interface FormState {
  endpoint: string
  region: string
  accessKeyId: string
  accessKeySecret: string
  bucketName: string
  prefix: string
}

export function ConfigForm({ config, onSaved }: ConfigFormProps): React.ReactElement {
  const [form, setForm] = React.useState<FormState>({
    endpoint: config.values.endpoint,
    region: config.values.region,
    accessKeyId: '',
    accessKeySecret: '',
    bucketName: config.values.bucketName,
    prefix: config.values.prefix,
  })
  const [busy, setBusy] = React.useState<'save' | 'test' | ''>('')
  const [message, setMessage] = React.useState<BannerMessage | null>(null)

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    setMessage(null)
    try {
      const view = await request<ConfigView>('config/save', form)
      setMessage({ tone: 'success', text: `配置已保存：${view.configPath}` })
      onSaved(view)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  const test = async (): Promise<void> => {
    setBusy('test')
    setMessage(null)
    try {
      const result = await request<{ latencyMs: number; bucket: string }>('config/test', form)
      setMessage({ tone: 'success', text: `连接成功（${result.latencyMs} ms）bucket=${result.bucket}` })
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy('')
    }
  }

  const field = (
    label: string,
    key: keyof FormState,
    options: { placeholder?: string; password?: boolean } = {},
  ): React.ReactElement => (
    <label style={S.field} key={key}>
      <span style={S.label}>{label}</span>
      <input
        style={S.input}
        value={form[key]}
        onChange={set(key)}
        placeholder={options.placeholder}
        type={options.password ? 'password' : 'text'}
        autoComplete="off"
      />
    </label>
  )

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ ...S.dim, marginBottom: '10px' }}>
        配置文件：<span style={S.code}>{config.configPath}</span>（明文保存，请勿提交到版本库）
      </div>
      {field('endpoint', 'endpoint', { placeholder: 'oss-cn-hangzhou.aliyuncs.com' })}
      {field('region', 'region', { placeholder: 'oss-cn-hangzhou' })}
      {field('access-key-id', 'accessKeyId', {
        placeholder: config.values.accessKeyIdMasked ? `已保存：${config.values.accessKeyIdMasked}` : '',
      })}
      {field('access-key-secret', 'accessKeySecret', {
        password: true,
        placeholder: config.values.accessKeySecretSet ? '已保存，留空表示不修改' : '',
      })}
      {field('bucket-name', 'bucketName', { placeholder: 'my-bucket' })}
      {field('prefix（可选）', 'prefix', { placeholder: 'dsh-asset-archiver' })}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <Button primary disabled={busy !== ''} onClick={() => { void save() }}>
          {busy === 'save' ? '保存中…' : '保存'}
        </Button>
        <Button disabled={busy !== ''} onClick={() => { void test() }}>
          {busy === 'test' ? '测试中…' : '测试连接'}
        </Button>
      </div>
      <div style={{ marginTop: '10px' }}>
        <Banner message={message} />
      </div>
    </div>
  )
}
