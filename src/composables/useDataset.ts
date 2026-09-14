import { shallowRef, ref } from 'vue'
import type { Dataset } from '../domain/types'
import { loadDataset } from '../data/repository'
const dataset = shallowRef<Dataset>()
const loading = ref(false)
const error = ref('')
async function reload() {
  loading.value = true
  error.value = ''
  try { dataset.value = await loadDataset() }
  catch (cause) { dataset.value = undefined; error.value = cause instanceof Error ? cause.message : '数据读取失败，请重试' }
  finally { loading.value = false }
}
export function useDataset() {
  if (!dataset.value && !loading.value && !error.value) void reload()
  return { dataset, loading, error, reload }
}
