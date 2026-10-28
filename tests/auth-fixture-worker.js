/** 독립 로컬 검증에만 사용하는 인증 저장소 제어. 운영 Worker는 이 파일을 가져오지 않는다. */
import worker from '../worker.js';
import { AuthStore as ProductionAuthStore } from '../api/auth.js';
export default worker;
export class AuthStore extends ProductionAuthStore {
  async run(op, body) {
    if (op === 'test-alarm') { await this.alarm(); return { success: true }; }
    if (op === 'test-usage') {
      // 가상 접속을 과거로 옮겨 30분 공백과 보관 기간을 검증한다.
      const sql = this.usageTable();
      if (Number.isFinite(body.age)) sql.exec('UPDATE usage_visits SET started_at = started_at - ?, last_at = last_at - ?', body.age, body.age);
      return { rows: sql.exec('SELECT COUNT(*) AS n FROM usage_visits').one().n };
    }
    if (!['test-device', 'test-invite'].includes(op)) return super.run(op, body);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(op === 'test-device' ? body.deviceToken : body.invite));
    const key = (op === 'test-device' ? 'device:' : 'invite:') + [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    if (body.remove) await this.db.delete(key);
    const device = await this.db.get(key);
    if (device && Number.isFinite(body.expires)) { device.expires = body.expires; await this.db.put(key, device); }
    return device || null;
  }
}
