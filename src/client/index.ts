import { Context } from '@koishijs/plugin-console'
import ConfigPage from './pages/config.vue'

export default (ctx: Context) => {
  ctx.addPage({
    name: 'qq-group-join-verification',
    path: '/qq-group-join-verification',
    title: 'QQ 群加入验证',
    icon: 'shield-check',
    component: ConfigPage,
  })
}