<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AppLayout from './components/AppLayout.vue'
const renderError = ref('')
onErrorCaptured(error => { renderError.value = error.message; return false })
function reloadApp() { window.location.reload() }
</script>
<template><ElConfigProvider :locale="zhCn"><AppLayout><div v-if="renderError" class="panel"><h1>页面加载失败</h1><p>{{ renderError }}</p><ElButton @click="reloadApp">重新加载</ElButton></div><RouterView v-else /></AppLayout></ElConfigProvider></template>
