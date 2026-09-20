/**
 * 🧸 daycare-helper Children Store & Class Isolation Module (children-store.js)
 * 2026 Modern Vanilla JS (ES2024+)
 * 
 * - 원아 목록 노션 직결 쿼리 및 학급별 100% 철통 격리
 * - 원아 칩 스크롤 렌더링 및 '우리 반 놀이 (학급 전체)' 모드 제어
 * - 원아 등록/수정 모달 및 자가 치유(Self-Healing) 저장
 * - 노션 TEACHER_DB 교사 프로필 동기화
 */

async function loadChildren(selectedId = null) {
  const state = window.state || {};
  const currentTeacherKey = state.activeTeacherKey || 'wife';
  const currentClass = state.className || '사랑반';
  const notionConfig = window.NOTION_CONFIG || {};

  const notionStatusBadge = document.getElementById('notionStatusBadge');
  const notionStatusText = document.getElementById('notionStatusText');

  // 1. 브라우저에서 minmin-notion 직접 쿼리 (Cloudflare 1042 회피 1순위)
  try {
    if (typeof directNotionCall === 'function' && notionConfig.CHILD_DB_ID) {
      const data = await directNotionCall(`/databases/${notionConfig.CHILD_DB_ID}/query`, 'POST', {
        page_size: 100,
        sorts: [{ property: '아동명', direction: 'ascending' }]
      });

      const allChildren = (data.results || []).map(page => {
        const props = page.properties;
        const name = props['아동명']?.title?.[0]?.plain_text || '이름 없음';
        const rawAge = props['생년월일/연령']?.rich_text?.[0]?.plain_text || '만 4세';
        const traits = props['성향 및 특이사항']?.rich_text?.[0]?.plain_text || '';
        const parentStyle = props['학부모 성향 & 알림장 스타일']?.rich_text?.[0]?.plain_text || '';
        const allergies = props['알레르기/주의사항']?.rich_text?.[0]?.plain_text || '';
        
        let childClass = props['소속 반']?.select?.name || '';
        if (!childClass && rawAge.includes('(')) {
          const match = rawAge.match(/\((.*?)\)/);
          if (match && match[1]) childClass = match[1].trim();
        }

        return { id: page.id, name, age: rawAge, traits, allergies, childClass, parentStyle };
      });

      // 🔒 교사/학급별 원아 & 학부모 성향 데이터 철통 격리 필터!
      const isolatedChildren = allChildren.filter(c => {
        if (currentTeacherKey === 'wife') {
          return c.childClass === '사랑반' || c.age.includes('사랑반') || c.age.includes('0세');
        } else if (currentTeacherKey === 'sister_in_law') {
          return c.childClass === '소망반' || c.age.includes('소망반') || c.age.includes('2세');
        } else { // sandbox
          return c.childClass === '연구반' || c.name.includes('민수') || c.name.includes('민서') || !c.childClass;
        }
      });

      state.children = isolatedChildren;
      if (notionStatusBadge) notionStatusBadge.className = 'badge badge-connected';
      if (notionStatusText) notionStatusText.textContent = '노션 연동됨';
      renderChildrenChips(selectedId);
      return;
    }
  } catch (directErr) {
    console.warn('Direct notion query failed, trying worker endpoint:', directErr);
  }

  // 2. 워커 /api/children 폴백
  try {
    const res = await fetch('/api/children');
    const data = await res.json();
    const rawList = data.children || [];

    state.children = rawList.filter(c => {
      if (currentTeacherKey === 'wife') {
        return c.childClass === '사랑반' || (c.age && (c.age.includes('사랑반') || c.age.includes('0세')));
      } else if (currentTeacherKey === 'sister_in_law') {
        return c.childClass === '소망반' || (c.age && (c.age.includes('소망반') || c.age.includes('2세')));
      } else {
        return c.childClass === '연구반' || c.name.includes('민수') || c.name.includes('민서') || !c.childClass;
      }
    });

    if (data.source === 'notion') {
      if (notionStatusBadge) notionStatusBadge.className = 'badge badge-connected';
      if (notionStatusText) notionStatusText.textContent = '노션 연동됨';
    }

    renderChildrenChips(selectedId);
  } catch (err) {
    console.warn('원아 목록 불러오기 실패, 담당 반 전용 샘플 사용:', err);
    if (currentTeacherKey === 'wife') {
      state.children = [
        { id: 'mock-child-w1', name: '이도윤', age: '만 0세 (사랑반)', childClass: '사랑반', traits: '오감 자극 딸랑이 및 촉감 놀이 선호', parentStyle: '안심 서술형 (수면 및 이유식 세심 안내 선호)', allergies: '' }
      ];
    } else if (currentTeacherKey === 'sister_in_law') {
      state.children = [
        { id: 'mock-child-s1', name: '박서준', age: '만 2세 (소망반)', childClass: '소망반', traits: '탈것 및 블록 기차 놀이 몰입', parentStyle: '발달 관찰형 (조작력 성장 중심 선호)', allergies: '' }
      ];
    } else {
      state.children = [
        { id: 'mock-child-sb1', name: '김민수', age: '만 5세', childClass: '연구반', traits: '블록 동물원 울타리 만들기 몰입', parentStyle: '자유 소통형', allergies: '' }
      ];
    }
    renderChildrenChips(selectedId);
  }
}

function renderChildrenChips(selectedId = null) {
  const state = window.state || {};
  const childScrollContainer = document.getElementById('childScrollContainer');
  const selectedChildAge = document.getElementById('selectedChildAge');
  const childTraitsText = document.getElementById('childTraitsText');
  const childParentText = document.getElementById('childParentText');
  const childAlertText = document.getElementById('childAlertText');
  if (!childScrollContainer) return;

  childScrollContainer.innerHTML = '';

  const classFilterText = document.getElementById('classFilterText');
  if (classFilterText) {
    classFilterText.textContent = `${state.className} 전용`;
  }

  const currentClass = state.className || '사랑반';
  let displayList = state.children || [];

  if (currentClass === '연구반' && displayList.length === 0) {
    displayList = [
      {
        id: '3e0a2711-5b68-81ec-b2a1-f1d6ac1e0184',
        name: '김민수',
        childClass: '연구반',
        age: '만 5세',
        birthDate: '2021-05-15',
        gender: '남',
        traits: '블록 놀이와 탈것을 좋아하며 집중력이 높고 호기심이 많음.',
        parentStyle: '칭찬과 격려를 좋아하시고 오늘의 특별한 놀이 활동을 궁금해하심',
        allergies: '없음'
      },
      {
        id: '3e0a2711-5b68-81a1-95e2-dfda7a74750f',
        name: '김민서',
        childClass: '연구반',
        age: '만 1세',
        birthDate: '2025-02-10',
        gender: '여',
        traits: '방긋방긋 잘 웃고 음악에 맞춰 몸을 흔드는 것을 좋아함.',
        parentStyle: '따뜻한 일상 소통을 선호하시고 수면 및 이유식 섭취 상태를 세심하게 챙기심',
        allergies: '계란 알레르기 주의'
      }
    ];
    state.children = displayList;
  }

  if (displayList.length === 0) {
    const noticeChip = document.createElement('div');
    noticeChip.className = 'child-chip';
    noticeChip.style.background = '#FEF3C7';
    noticeChip.style.borderColor = '#F59E0B';
    noticeChip.style.color = '#92400E';
    noticeChip.innerHTML = `<span>🌱 ${currentClass} 등록 원아가 없습니다</span>`;
    childScrollContainer.appendChild(noticeChip);

    const addChip = document.createElement('div');
    addChip.className = 'child-chip child-chip-add';
    addChip.innerHTML = `<span>➕ ${currentClass} 새 원아 등록</span>`;
    addChip.addEventListener('click', () => openChildModal('add'));
    childScrollContainer.appendChild(addChip);

    state.selectedChild = null;
    if (selectedChildAge) selectedChildAge.textContent = '-';
    if (childParentText) childParentText.style.display = 'none';
    if (childAlertText) childAlertText.style.display = 'none';
    return;
  }

  let targetChild = null;
  // 🌟 사용자가 특정 원아를 명시적으로 클릭하지 않은 경우, 무조건 '우리 반 놀이 (전체 원아 자동 인식)'가 100% 기본값
  const isClassAllSelected = (!selectedId || selectedId === 'class-all');
  const classAllChip = document.createElement('div');
  classAllChip.className = `child-chip ${isClassAllSelected ? 'active' : ''}`;
  classAllChip.style.borderColor = '#3B82F6';
  if (isClassAllSelected) {
    classAllChip.style.background = '#2563EB';
    classAllChip.style.color = '#FFFFFF';
  } else {
    classAllChip.style.background = '#EFF6FF';
    classAllChip.style.color = '#1D4ED8';
  }
  classAllChip.innerHTML = `
    <span class="child-avatar">🌟</span>
    <span style="font-weight: 700;">우리 반 놀이</span>
  `;
  classAllChip.addEventListener('click', () => {
    childScrollContainer.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
    classAllChip.classList.add('active');
    selectClassAllMode();
  });
  childScrollContainer.appendChild(classAllChip);

  displayList.forEach((child) => {
    const isSelected = selectedId ? child.id === selectedId : false;
    if (isSelected && !targetChild) targetChild = child;

    const chip = document.createElement('div');
    chip.className = `child-chip ${isSelected ? 'active' : ''}`;
    const classBadge = (!state.filterOnlyMyClass && child.childClass) ? `<small style="font-size: 10px; opacity: 0.8; margin-left: 2px;">(${child.childClass})</small>` : '';
    chip.innerHTML = `
      <span class="child-avatar">${getAvatarEmoji(child.name)}</span>
      <span>${child.name}${classBadge}</span>
    `;
    chip.addEventListener('click', () => {
      childScrollContainer.querySelectorAll('.child-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectChild(child);
    });
    childScrollContainer.appendChild(chip);
  });

  const addChip = document.createElement('div');
  addChip.className = 'child-chip child-chip-add';
  addChip.innerHTML = '<span>➕ 추가</span>';
  addChip.addEventListener('click', () => openChildModal('add'));
  childScrollContainer.appendChild(addChip);

  if (isClassAllSelected || !targetChild) {
    selectClassAllMode();
  } else if (targetChild) {
    selectChild(targetChild);
  }
}

function selectClassAllMode() {
  const state = window.state || {};
  const selectedChildAge = document.getElementById('selectedChildAge');
  const childTraitsText = document.getElementById('childTraitsText');
  const childParentText = document.getElementById('childParentText');
  const childAlertText = document.getElementById('childAlertText');
  const modeSwitcher = document.getElementById('modeSwitcher');
  const rawMemoInput = document.getElementById('rawMemoInput');

  const defaultAge = (state.className && state.className.includes('사랑')) ? '만 0세' : '만 2세';
  state.selectedChild = {
    id: 'class-all',
    name: `${state.className} 우리 반`,
    age: defaultAge,
    traits: `${state.className} 유아들의 협동 놀이, 신체활동 및 놀이 몰입`,
    parentStyle: '학급 전체 학부모 대상 다정체 서술 및 귀가 후 칭찬 질문 안내',
    allergies: ''
  };
  if (selectedChildAge) selectedChildAge.textContent = defaultAge;
  if (childTraitsText) {
    childTraitsText.innerHTML = `🌟 <strong>${state.className} 놀이중심 보육일지 & 알림장 (원아 자동 인식)</strong>: 전체 놀이 메모를 남기시면 학급 보육일지와 개별 원아 놀이가 자동 발췌되어 1초 눈 검수 승인을 받습니다.`;
  }
  if (childParentText) {
    childParentText.style.display = 'block';
    childParentText.textContent = `💌 학부모 소통: 학급 전체 공지 알림장 + 개별 원아 알림장 자동 분할 연동`;
  }
  if (childAlertText) childAlertText.style.display = 'none';

  if (modeSwitcher && state.mode !== 'class_report') {
    const reportBtn = modeSwitcher.querySelector('.mode-btn[data-mode="class_report"]');
    if (reportBtn) {
      modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      reportBtn.classList.add('active');
      state.mode = 'class_report';
      if (rawMemoInput) {
        rawMemoInput.placeholder = "오늘 우리 반 유아들의 실내/바깥 놀이 장면과 키워드를 편하게 적어주세요.\n예) 블록 기차놀이로 레일 연결 및 역할놀이, 바깥 산책 후 앞마당 비눗방울 쫓기와 술래잡기, 체육 대형 무지개 낙하산 펄럭이기";
      }
    }
  }
}

function getAvatarEmoji(name) {
  const emojis = ['👧', '👦', '🧒', '👶', '🐣'];
  const charCode = (name || '').charCodeAt(0) || 0;
  return emojis[charCode % emojis.length];
}

function selectChild(child) {
  if (!child) return;
  if (child.id === 'class-all') {
    selectClassAllMode();
    return;
  }

  const state = window.state || {};
  const modeSwitcher = document.getElementById('modeSwitcher');
  const rawMemoInput = document.getElementById('rawMemoInput');
  const selectedChildAge = document.getElementById('selectedChildAge');
  const childTraitsText = document.getElementById('childTraitsText');
  const childParentText = document.getElementById('childParentText');
  const childAlertText = document.getElementById('childAlertText');

  if (state.mode === 'class_report' && modeSwitcher) {
    const playBtn = modeSwitcher.querySelector('.mode-btn[data-mode="play_story"]');
    if (playBtn) {
      modeSwitcher.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      playBtn.classList.add('active');
      state.mode = 'play_story';
      if (rawMemoInput) {
        rawMemoInput.placeholder = "오늘 아이가 몰입했던 놀이 장면이나 키워드를 편하게 남겨주세요.\n예) 블록으로 큰 동물원 우리를 만들며 기린 인형에게 풀을 주는 흉내를 냄. 친구와 웃으며 울타리를 넓혀감.";
      }
    }
  }

  state.selectedChild = child;
  if (selectedChildAge) selectedChildAge.textContent = child.age || '만 4세';
  if (childTraitsText) childTraitsText.textContent = `💡 성향: ${child.traits || '특이사항 없음'}`;
  
  if (childParentText) {
    if (child.parentStyle) {
      childParentText.style.display = 'block';
      childParentText.textContent = `👪 학부모 선호: ${child.parentStyle}`;
    } else {
      childParentText.style.display = 'none';
    }
  }

  if (childAlertText) {
    if (child.allergies) {
      childAlertText.style.display = 'block';
      childAlertText.textContent = `⚠️ 주의: ${child.allergies}`;
    } else {
      childAlertText.style.display = 'none';
    }
  }

  if (state.mode === 'observation' && typeof autoDistributeObsDates === 'function') {
    autoDistributeObsDates();
  }
}

function openChildModal(mode = 'add', child = null) {
  const childManageModal = document.getElementById('childManageModal');
  const childModalTitle = document.getElementById('childModalTitle');
  const manageChildId = document.getElementById('manageChildId');
  const manageChildName = document.getElementById('manageChildName');
  const manageChildAge = document.getElementById('manageChildAge');
  const manageChildClass = document.getElementById('manageChildClass');
  const manageChildTraits = document.getElementById('manageChildTraits');
  const manageChildParentStyle = document.getElementById('manageChildParentStyle');
  const manageChildAllergies = document.getElementById('manageChildAllergies');
  const saveChildBtn = document.getElementById('saveChildBtn');
  const parentPresetGrid = document.getElementById('parentPresetGrid');
  const state = window.state || {};

  if (!childManageModal) return;

  if (parentPresetGrid) {
    parentPresetGrid.querySelectorAll('.parent-preset-btn').forEach(b => b.classList.remove('active'));
  }

  if (mode === 'edit' && child) {
    if (childModalTitle) childModalTitle.textContent = `👶 ${child.name} 정보 및 성향 수정`;
    if (manageChildId) manageChildId.value = child.id || '';
    if (manageChildName) manageChildName.value = child.name || '';
    
    let rawAge = child.age || '만 4세';
    let extractedClass = child.childClass || state.className || '햇살반';
    if (rawAge.includes('(')) {
      const parts = rawAge.split('(');
      rawAge = parts[0].trim();
      if (!child.childClass) extractedClass = parts[1].replace(')', '').trim();
    }
    if (manageChildAge) manageChildAge.value = rawAge;
    if (manageChildClass) {
      manageChildClass.value = extractedClass;
      manageChildClass.disabled = true;
    }

    if (manageChildTraits) manageChildTraits.value = child.traits || '';
    if (manageChildParentStyle) manageChildParentStyle.value = child.parentStyle || '';
    if (manageChildAllergies) manageChildAllergies.value = child.allergies || '';
    if (saveChildBtn) saveChildBtn.innerHTML = '<span>💾</span> <span>원아 정보 수정 저장</span>';
  } else {
    if (childModalTitle) childModalTitle.textContent = `👶 새 원아 등록 (${state.className} 전용)`;
    if (manageChildId) manageChildId.value = '';
    if (manageChildName) manageChildName.value = '';
    if (manageChildAge) manageChildAge.value = state.className === '사랑반' ? '만 0세' : (state.className === '소망반' ? '만 2세' : '만 4세');
    if (manageChildClass) {
      manageChildClass.value = state.className || '사랑반';
      manageChildClass.disabled = true;
    }
    if (manageChildTraits) manageChildTraits.value = '';
    if (manageChildParentStyle) manageChildParentStyle.value = '';
    if (manageChildAllergies) manageChildAllergies.value = '';
    if (saveChildBtn) saveChildBtn.innerHTML = '<span>💾</span> <span>노션에 원아 등록하기</span>';
  }

  childManageModal.style.display = 'flex';
  if (manageChildName) manageChildName.focus();
}

async function handleChildFormSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const manageChildName = document.getElementById('manageChildName');
  const manageChildId = document.getElementById('manageChildId');
  const manageChildAge = document.getElementById('manageChildAge');
  const manageChildClass = document.getElementById('manageChildClass');
  const manageChildTraits = document.getElementById('manageChildTraits');
  const manageChildParentStyle = document.getElementById('manageChildParentStyle');
  const manageChildAllergies = document.getElementById('manageChildAllergies');
  const saveChildBtn = document.getElementById('saveChildBtn');
  const childManageModal = document.getElementById('childManageModal');
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};

  const name = manageChildName ? manageChildName.value.trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('원아 이름을 입력해주세요.');
    return;
  }

  const id = manageChildId ? manageChildId.value : '';
  const baseAge = manageChildAge ? manageChildAge.value : '만 4세';
  const childClass = state.className || (manageChildClass ? manageChildClass.value.trim() : '사랑반');
  const age = childClass ? `${baseAge} (${childClass})` : baseAge;
  const traits = manageChildTraits ? manageChildTraits.value.trim() : '';
  const parentStyle = manageChildParentStyle ? manageChildParentStyle.value.trim() : '';
  const allergies = manageChildAllergies ? manageChildAllergies.value.trim() : '';

  if (saveChildBtn) {
    saveChildBtn.disabled = true;
    saveChildBtn.innerHTML = '<span>⏳</span> <span>노션에 저장 중...</span>';
  }

  try {
    let savedChildId = id;
    let isCreated = false;
    const isRealNotionId = Boolean(id && !id.startsWith('mock-') && !id.startsWith('sandbox_') && id.length > 20);

    // 1. 브라우저에서 minmin-notion 직접 저장/수정
    try {
      if (typeof directNotionCall === 'function') {
        if (isRealNotionId) {
          try {
            const updateProps = {
              '아동명': { title: [{ text: { content: name } }] },
              '생년월일/연령': { rich_text: [{ text: { content: age } }] },
              '소속 반': { select: { name: childClass } },
              '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
              '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
              '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
            };
            const updateRes = await directNotionCall(`/pages/${id}`, 'PATCH', { properties: updateProps });
            savedChildId = updateRes.id;
          } catch (patchErr) {
            console.warn('[Self-Healing] 기존 페이지 수정 실패 -> 신규 원아로 자동 생성 전환:', patchErr);
            const createPayload = {
              parent: { database_id: notionConfig.CHILD_DB_ID },
              properties: {
                '아동명': { title: [{ text: { content: name } }] },
                '생년월일/연령': { rich_text: [{ text: { content: age } }] },
                '소속 반': { select: { name: childClass } },
                '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
                '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
                '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
              }
            };
            const createRes = await directNotionCall('/pages', 'POST', createPayload);
            savedChildId = createRes.id;
            isCreated = true;
          }
        } else {
          const createPayload = {
            parent: { database_id: notionConfig.CHILD_DB_ID },
            properties: {
              '아동명': { title: [{ text: { content: name } }] },
              '생년월일/연령': { rich_text: [{ text: { content: age } }] },
              '소속 반': { select: { name: childClass } },
              '성향 및 특이사항': { rich_text: [{ text: { content: traits } }] },
              '학부모 성향 & 알림장 스타일': { rich_text: [{ text: { content: parentStyle } }] },
              '알레르기/주의사항': { rich_text: [{ text: { content: allergies } }] }
            }
          };
          const createRes = await directNotionCall('/pages', 'POST', createPayload);
          savedChildId = createRes.id;
          isCreated = true;
        }

        if (childManageModal) childManageModal.style.display = 'none';
        if (typeof showToast === 'function') {
          showToast(isCreated ? `🎉 ${name} 원아가 노션 마스터 DB에 안전하게 등록되었습니다!` : `✅ ${name} 정보가 수정되었습니다.`);
        }
        await loadChildren(savedChildId);
        return;
      }
    } catch (directFailErr) {
      console.warn('Direct notion save failed, trying worker endpoint:', directFailErr);
    }

    // 2. 워커 /api/children 폴백
    let res;
    if (isRealNotionId) {
      res = await fetch(`/api/children/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age, childClass, traits, parentStyle, allergies })
      });
    } else {
      res = await fetch('/api/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age, childClass, traits, parentStyle, allergies })
      });
    }

    if (!res.ok) {
      throw new Error('원아 저장 중 오류가 발생했습니다.');
    }

    const json = await res.json();
    if (childManageModal) childManageModal.style.display = 'none';
    if (typeof showToast === 'function') {
      showToast(`🎉 ${name} 원아가 안전하게 저장되었습니다!`);
    }
    await loadChildren(json.child?.id || null);
  } catch (err) {
    console.error('원아 저장 실패:', err);
    if (typeof showToast === 'function') showToast(`저장 실패: ${err.message || '네트워크 오류'}`);
  } finally {
    if (saveChildBtn) {
      saveChildBtn.disabled = false;
      saveChildBtn.innerHTML = '<span>💾</span> <span>노션에 원아 저장하기</span>';
    }
  }
}

// ☁️ 노션 TEACHER_DB에서 교사 프로필 동기화
async function handleSyncTeacherProfile() {
  const syncTeacherFromNotionBtn = document.getElementById('syncTeacherFromNotionBtn');
  const settingClassNameInput = document.getElementById('settingClassNameInput');
  const settingTeacherNameInput = document.getElementById('settingTeacherNameInput');
  const personaSampleNote = document.getElementById('personaSampleNote');
  const personaClosingGreeting = document.getElementById('personaClosingGreeting');
  const personaCallStyle = document.getElementById('personaCallStyle');
  const personaPresetGrid = document.getElementById('personaPresetGrid');
  const state = window.state || {};
  const notionConfig = window.NOTION_CONFIG || {};

  if (!syncTeacherFromNotionBtn) return;
  syncTeacherFromNotionBtn.disabled = true;
  syncTeacherFromNotionBtn.innerHTML = '<span>⏳</span> <span>프로필 조회 중...</span>';

  try {
    const data = await directNotionCall(`/databases/${notionConfig.TEACHER_DB_ID}/query`, 'POST', {
      page_size: 20
    });

    const records = data.results || [];
    if (records.length === 0) {
      if (typeof showToast === 'function') showToast('노션 TEACHER_DB에 등록된 교사 프로필이 없습니다.');
      return;
    }

    const currentClass = (settingClassNameInput ? settingClassNameInput.value.trim() : state.className) || '햇살반';
    const currentTeacher = (settingTeacherNameInput ? settingTeacherNameInput.value.trim() : state.teacherName) || '김선생님';

    let matched = records.find(p => {
      const cls = p.properties['담당반']?.select?.name;
      const tch = p.properties['교사명']?.title?.[0]?.plain_text;
      return (cls && cls === currentClass) || (tch && tch === currentTeacher);
    });

    if (!matched && records.length > 0) {
      matched = records[0];
    }

    const pProps = matched.properties;
    const tName = pProps['교사명']?.title?.[0]?.plain_text || currentTeacher;
    const cClass = pProps['담당반']?.select?.name || currentClass;
    const presetName = pProps['문체 프리셋']?.select?.name || '놀이 중심 다정체';
    const sampleNote = pProps['평소 알림장 예시문']?.rich_text?.[0]?.plain_text || '';
    const closing = pProps['기본 마무리 멘트']?.rich_text?.[0]?.plain_text || '';
    const callStyle = pProps['원아 호칭']?.rich_text?.[0]?.plain_text || '우리 [아동A]';

    if (settingClassNameInput) settingClassNameInput.value = cClass;
    if (settingTeacherNameInput) settingTeacherNameInput.value = tName;
    if (personaSampleNote) personaSampleNote.value = sampleNote;
    if (personaClosingGreeting) personaClosingGreeting.value = closing;
    if (personaCallStyle) personaCallStyle.value = callStyle;

    let foundPresetKey = 'play_friendly';
    if (presetName.includes('발달') || presetName.includes('서술')) foundPresetKey = 'growth_detail';
    else if (presetName.includes('공감') || presetName.includes('따뜻')) foundPresetKey = 'warm_parent';
    else if (presetName.includes('생동') || presetName.includes('밝')) foundPresetKey = 'lively_vivid';

    if (personaPresetGrid) {
      personaPresetGrid.querySelectorAll('.persona-preset-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.preset === foundPresetKey);
      });
    }

    if (typeof showToast === 'function') showToast(`☁️ 노션에서 '${tName} (${cClass})' 프로필을 불러왔습니다!`);
  } catch (err) {
    console.error('교사 프로필 동기화 실패:', err);
    if (typeof showToast === 'function') showToast('교사 프로필 불러오기에 실패했습니다.');
  } finally {
    if (syncTeacherFromNotionBtn) {
      syncTeacherFromNotionBtn.disabled = false;
      syncTeacherFromNotionBtn.innerHTML = '<span>☁️</span> <span>노션 프로필 불러오기</span>';
    }
  }
}

// 🌐 전역 네임스페이스 및 하위 호환성 등록
window.loadChildren = loadChildren;
window.renderChildrenChips = renderChildrenChips;
window.selectClassAllMode = selectClassAllMode;
window.getAvatarEmoji = getAvatarEmoji;
window.selectChild = selectChild;
window.openChildModal = openChildModal;
window.handleChildFormSubmit = handleChildFormSubmit;
window.handleSyncTeacherProfile = handleSyncTeacherProfile;

window.DaycareChildren = {
  loadChildren,
  renderChildrenChips,
  selectClassAllMode,
  getAvatarEmoji,
  selectChild,
  openChildModal,
  handleChildFormSubmit,
  handleSyncTeacherProfile
};
