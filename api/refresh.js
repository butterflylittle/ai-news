const OWNER = 'butterflylittle'
const REPO = 'ai-news'
const WORKFLOW = 'refresh.yml'

const reply = (body, status = 200) => Response.json(body, { status })

export default {
  async fetch(request) {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)

    const refreshSecret = process.env.REFRESH_SECRET
    const githubToken = process.env.GH_ACTIONS_TOKEN
    if (!refreshSecret || !githubToken) return reply({ error: 'Refresh service is not configured' }, 503)
    if (request.headers.get('authorization') !== `Bearer ${refreshSecret}`) return reply({ error: 'Unauthorized' }, 401)

    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${githubToken}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({ ref: 'main' })
    })

    if (!response.ok) {
      const detail = await response.text()
      return reply({ error: `GitHub dispatch failed (${response.status})`, detail: detail.slice(0, 300) }, 502)
    }

    return reply({ accepted: true, remote: true }, 202)
  }
}
