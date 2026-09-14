import { createApp } from 'vue'
import { ElAlert, ElButton, ElCard, ElConfigProvider, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElDialog, ElDrawer, ElEmpty, ElInput, ElOption, ElPagination, ElProgress, ElRadioButton, ElRadioGroup, ElSelect, ElSkeleton, ElSkeletonItem, ElTable, ElTableColumn, ElTabPane, ElTabs, ElTag, ElTooltip } from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/tokens.css'
import './styles/global.css'
import App from './App.vue'
import { router } from './app/router'

const app = createApp(App)
for (const component of [ElAlert, ElButton, ElCard, ElConfigProvider, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElDialog, ElDrawer, ElEmpty, ElInput, ElOption, ElPagination, ElProgress, ElRadioButton, ElRadioGroup, ElSelect, ElSkeleton, ElSkeletonItem, ElTable, ElTableColumn, ElTabPane, ElTabs, ElTag, ElTooltip]) app.use(component)
app.use(router).mount('#app')
