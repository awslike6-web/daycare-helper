#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧸 daycare-helper 실제 원아 및 교사 프로필 일괄 등록 스크립트
1. 교사:
   - 공가영 선생님 (사랑반, 만0세 영아)
   - 공가희 선생님 (소망반, 만2세 유아)
2. 원아:
   - 사랑반 (2명): 인우진, 김태리 (만0세)
   - 소망반 (7명): 김건하, 김하율, 김도준, 나화음, 서은호, 이제하, 임아윤 (만2세)
"""
import sys
import json
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PROXY = 'https://minmin-notion.awslike6.workers.dev'
HEADERS = {
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
    'User-Agent': 'Mozilla/5.0'
}

TEACHER_DB_ID = '3e0a2711-5b68-8186-ad30-cbaea7687006'
CHILD_DB_ID   = '3e0a2711-5b68-8182-955e-f116e4174e3a'

def notion_req(endpoint, method='GET', payload=None):
    url = f"{PROXY}/v1{endpoint}"
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"❌ Error {e.code} on {endpoint}: {e.read().decode('utf-8')}")
        return None

print("==================================================")
print("1. 교사 프로필 등록/갱신 (공가영 선생님, 공가희 선생님)")
print("==================================================")

teachers_data = [
    {
        "교사명": "공가영 선생님",
        "담당반": "사랑반",
        "문체 프리셋": "따뜻한 공감형",
        "원아 호칭": "우리 [아동A]",
        "단골 맺음말": "가정에서도 따뜻하고 포근한 저녁 시간 보내세요^^",
        "평소 알림장 예시문": "오늘 우리 우진이는 따뜻한 눈맞춤을 나누며 방긋방긋 미소를 많이 보여주었답니다. 분유도 씩씩하게 맛있게 먹고, 작은 손으로 딸랑이를 흔들며 소리에 귀를 기울이는 모습이 참 사랑스러웠어요. 편안하게 낮잠도 푹 자고 기분 좋게 하루를 보냈답니다. 가정에서도 우리 아가 많이 안아주세요💕"
    },
    {
        "교사명": "공가희 선생님",
        "담당반": "소망반",
        "문체 프리셋": "놀이 중심 다정체",
        "원아 호칭": "우리 [아동A]",
        "단골 맺음말": "가정에서도 오늘 즐거웠던 원 생활에 대해 많은 칭찬 부탁드립니다.^^",
        "평소 알림장 예시문": "오늘 우리 건하는 친구들과 넓은 놀이실에서 신나게 신체활동을 하며 에너지를 발산했답니다! 교사의 목소리에 귀를 기울이며 말소리를 예쁘게 따라 해보려는 모습이 참 기특했어요. 블록으로 멋진 집을 만들며 씩씩하게 놀이하는 모습에 박수를 보내주었답니다. 가정에서도 편안하고 행복한 저녁 되세요^^"
    }
]

# 기존 교사 조회
existing_teachers = notion_req(f"/databases/{TEACHER_DB_ID}/query", method='POST', payload={"page_size": 100})
existing_t_map = {}
for page in existing_teachers.get('results', []):
    t_title = page['properties']['교사명']['title']
    if t_title:
        existing_t_map[t_title[0]['plain_text']] = page['id']

for t in teachers_data:
    props = {
        "교사명": {"title": [{"text": {"content": t["교사명"]}}]},
        "담당반": {"select": {"name": t["담당반"]}},
        "문체 프리셋": {"select": {"name": t["문체 프리셋"]}},
        "원아 호칭": {"rich_text": [{"text": {"content": t["원아 호칭"]}}]},
        "기본 마무리 멘트": {"rich_text": [{"text": {"content": t["단골 맺음말"]}}]},
        "평소 알림장 예시문": {"rich_text": [{"text": {"content": t["평소 알림장 예시문"]}}]}
    }
    if t["교사명"] in existing_t_map:
        pid = existing_t_map[t["교사명"]]
        notion_req(f"/pages/{pid}", method='PATCH', payload={"properties": props})
        print(f"🔄 '{t['교사명']}' ({t['담당반']}) 프로필 업데이트 완료")
    else:
        created = notion_req("/pages", method='POST', payload={"parent": {"database_id": TEACHER_DB_ID}, "properties": props})
        print(f"🎉 '{t['교사명']}' ({t['담당반']}) 프로필 신규 등록 완료! (ID: {created.get('id')})")

print("\n==================================================")
print("2. 실제 원아 9명 일괄 등록/갱신")
print("==================================================")

children_data = [
    # 🍼 사랑반 (만0세, 공가영 선생님)
    {
        "아동명": "인우진",
        "소속반": "사랑반",
        "연령": "만 0세",
        "성향": "남아, 오감 감각 놀이 및 교사와의 따뜻한 애착 형성 중",
        "학부모성향": "안심 서술형 (수유량, 낮잠 시간, 작은 컨디션 변화 세심 안내 선호)",
        "주의사항": "없음"
    },
    {
        "아동명": "김태리",
        "소속반": "사랑반",
        "연령": "만 0세",
        "성향": "여아, 눈맞춤과 옹알이 반응이 좋으며 감각 탐색 놀이에 반응함",
        "학부모성향": "안심 서술형 (식사/수유, 낮잠, 정서적 안정감 중심 안내 선호)",
        "주의사항": "없음"
    },
    # 🎈 소망반 (만2세, 공가희 선생님)
    {
        "아동명": "김건하",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "남아, 교사의 말을 귀 기울여 따라 하려는 모방 발화가 나타남, 활발한 대근육 신체활동을 무척 즐김",
        "학부모성향": "담백한 일상 서술형 (아이가 즐거워한 놀이와 활동 중심의 자연스러운 소통)",
        "주의사항": "없음"
    },
    {
        "아동명": "김하율",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "여아, 흥이 많고 노래와 춤을 매우 좋아함. 발음이 아직 미숙하여 언어 표현보다 표정과 신체 표현을 많이 사용함",
        "학부모성향": "따뜻한 정서 공감형 (아이의 흥겨운 감정과 또래 상호작용 지지 선호)",
        "주의사항": "⚠️ 아토피가 심함 (피부 긁음 및 실내 보습/온도 세심 관찰)"
    },
    {
        "아동명": "김도준",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "남아, 신체놀이를 좋아하여 에너지 넘침(교실 내 안전 규칙 지도 중), 친구를 잘 챙기며 놀잇감을 잘 나누어 줌",
        "학부모성향": "교우관계 및 긍정 격려형 (친구와의 배려/나눔 일화 및 규칙 성장 칭찬 선호)",
        "주의사항": "없음"
    },
    {
        "아동명": "나화음",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "여아, 춤과 노래, 아기자기한 소꿉놀이를 좋아함. 약속을 잘 지키며, 낯선 환경에서는 긴장하는 조심스러운 성격",
        "학부모성향": "안정 지지형 (아이가 교실에서 편안하게 적응하고 성취한 따뜻한 순간 안내 선호)",
        "주의사항": "낯선 환경 방문 시 따뜻하게 손잡아주며 안심 유도"
    },
    {
        "아동명": "서은호",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "남아, 또래 친구들과 어울리는 것을 좋아하며, 신체놀이보다는 차분한 미술 및 조작 놀이에 깊이 몰입함",
        "학부모성향": "관심사 존중 및 성장 격려형 (손끝 조작 성취 칭찬 및 즐거운 신체놀이 점진적 확장)",
        "주의사항": "없음"
    },
    {
        "아동명": "이제하",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "남아, 신체 놀이와 뛰기를 매우 좋아함(교실 내 걷기 약속 지도 중). 블록 창의 만들기와 역할놀이 분담을 잘함",
        "학부모성향": "창의력 칭찬형 (뛰어난 블록 만들기 및 친구와의 협동 놀이 성과 공유 선호)",
        "주의사항": "⚠️ 놀이를 방해받으면 말보다 울음으로 표현함 (친구 중재 및 감정 언어화 지도)"
    },
    {
        "아동명": "임아윤",
        "소속반": "소망반",
        "연령": "만 2세",
        "성향": "여아, 친구들의 놀이를 관찰한 뒤 관심 있는 곳으로 이동해 탐색함. 노래와 춤추기를 좋아하며, 놀이 방해 시 싫다는 표현을 명확히 함",
        "학부모성향": "자율 탐색 격려형 (호기심 많은 다양한 놀이 이동과 즐거운 음악 놀이 소통 선호)",
        "주의사항": "한 가지 놀이 지속 시간이 짧으므로 다양한 놀이 코너 순차 지원"
    }
]

# 기존 원아 조회
existing_children = notion_req(f"/databases/{CHILD_DB_ID}/query", method='POST', payload={"page_size": 100})
existing_c_map = {}
for page in existing_children.get('results', []):
    c_title = page['properties']['아동명']['title']
    if c_title:
        existing_c_map[c_title[0]['plain_text']] = page['id']

for c in children_data:
    props = {
        "아동명": {"title": [{"text": {"content": c["아동명"]}}]},
        "소속 반": {"select": {"name": c["소속반"]}},
        "생년월일/연령": {"rich_text": [{"text": {"content": c["연령"]}}]},
        "성향 및 특이사항": {"rich_text": [{"text": {"content": c["성향"]}}]},
        "학부모 성향 & 알림장 스타일": {"rich_text": [{"text": {"content": c["학부모성향"]}}]},
        "알레르기/주의사항": {"rich_text": [{"text": {"content": c["주의사항"]}}]}
    }
    
    if c["아동명"] in existing_c_map:
        pid = existing_c_map[c["아동명"]]
        notion_req(f"/pages/{pid}", method='PATCH', payload={"properties": props})
        print(f"🔄 [{c['소속반']}] '{c['아동명']}' 데이터 업데이트 완료 (ID: {pid})")
    else:
        created = notion_req("/pages", method='POST', payload={"parent": {"database_id": CHILD_DB_ID}, "properties": props})
        print(f"🎉 [{c['소속반']}] '{c['아동명']}' 신규 등록 완료! (ID: {created.get('id')})")

print("\n✅ 공가영 선생님(사랑반 2명), 공가희 선생님(소망반 7명) 전원 등록이 성공적으로 완료되었습니다!")
