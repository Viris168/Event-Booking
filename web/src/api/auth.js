import client from './client.js'

export const login = (data) => client.post('/auth/login', data).then((r) => r.data)
export const register = (data) => client.post('/auth/register', data).then((r) => r.data)
