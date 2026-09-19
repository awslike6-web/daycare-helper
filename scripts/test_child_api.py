import json
import urllib.request

BASE_URL = "http://localhost:8787"

def test():
    # 1. 목록 조회
    req = urllib.request.Request(f"{BASE_URL}/api/children")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(f"[1] 원아 목록 조회 결과: {data.get('source')} (원아 수: {len(data.get('children', []))})")
        if data.get("children"):
            first_child = data["children"][0]
            print(f"    첫 번째 원아: {first_child['name']} (ID: {first_child['id']})")
            
            # 2. 수정 테스트
            child_id = first_child["id"]
            update_data = {
                "name": "박지민",
                "age": "만 3세",
                "traits": "블록 놀이를 아주 좋아하며 집중력이 높음",
                "allergies": "복숭아 알레르기 주의"
            }
            payload = json.dumps(update_data).encode("utf-8")
            update_req = urllib.request.Request(
                f"{BASE_URL}/api/children/{child_id}",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="PUT"
            )
            try:
                with urllib.request.urlopen(update_req) as u_resp:
                    u_data = json.loads(u_resp.read().decode("utf-8"))
                    print(f"[2] 원아 수정 성공: {u_data.get('mode')} -> {u_data.get('child', {}).get('name')}")
            except urllib.error.HTTPError as he:
                print(f"[2] 원아 수정 HTTP 에러: {he.code} - {he.read().decode('utf-8')}")
            except Exception as e:
                print(f"[2] 원아 수정 실패: {e}")

            # 3. 일지 저장 테스트
            log_data = {
                "date": "2026-09-19",
                "childId": child_id,
                "childName": "박지민",
                "activityArea": "신체운동",
                "standardArea": "신체운동·건강",
                "rawMemo": "미끄럼틀 계단 안전하게 오르고 친구에게 양보함",
                "kidsnoteText": "오늘 지민이는 미끄럼틀 놀이를 하며 친구에게 차례를 양보하는 멋진 배려를 보여주었답니다!^^",
                "observationText": "미끄럼틀 계단을 난간을 잡고 두 발 모아 안전하게 오름. 뒤따라오는 또래에게 먼저 타도록 손짓하며 규칙을 준수함.",
                "citationSummary": "📌 과거 기록 대비 안전 규칙 인지력 및 배려 행동 향상"
            }
            log_payload = json.dumps(log_data).encode("utf-8")
            log_req = urllib.request.Request(
                f"{BASE_URL}/api/logs/save",
                data=log_payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(log_req) as l_resp:
                    l_data = json.loads(l_resp.read().decode("utf-8"))
                    print(f"[3] 일지 저장 성공: {l_data.get('mode')} -> {l_data.get('title')}")
            except Exception as e:
                print(f"[3] 일지 저장 실패: {e}")

if __name__ == "__main__":
    test()
