import svgCaptcha from 'svg-captcha'

class CaptchaService {
  private cache: Map<string, { code: string; expireTime: number }> = new Map()

  constructor() {
    this.startCleanupTimer()
  }

  private startCleanupTimer() {
    setInterval(() => {
      const now = Date.now()
      for (const [key, item] of this.cache.entries()) {
        if (item.expireTime < now) {
          this.cache.delete(key)
        }
      }
    }, 60000)
  }

  generateTextCaptcha(length: number = 4): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }

  generateImageCaptcha(length: number = 4): { code: string; svg: string } {
    const captcha = svgCaptcha.create({
      size: length,
      ignoreChars: '0o1il',
      noise: 3,
      color: true,
      background: '#ffffff',
    })
    return {
      code: captcha.text.toUpperCase(),
      svg: captcha.data,
    }
  }

  setCaptcha(key: string, code: string, expireTime: number = 180000): void {
    this.cache.set(key, {
      code: code.toUpperCase(),
      expireTime: Date.now() + expireTime,
    })
  }

  verifyCaptcha(key: string, code: string): boolean {
    const item = this.cache.get(key)
    if (!item) return false
    if (item.expireTime < Date.now()) {
      this.cache.delete(key)
      return false
    }
    const result = item.code === code.toUpperCase()
    if (result) {
      this.cache.delete(key)
    }
    return result
  }

  clearCaptcha(key: string): void {
    this.cache.delete(key)
  }
}

const captchaService = new CaptchaService()

export {
  captchaService,
}

export default captchaService