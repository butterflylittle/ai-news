import DefaultTheme from 'vitepress/theme'
import Dashboard from './Dashboard.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Dashboard', Dashboard)
  }
}
