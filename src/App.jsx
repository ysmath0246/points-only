// src/App.jsx
import { useEffect, useMemo, useState } from 'react';
import './index.css';
import { db } from './firebase';
import {
  collection, doc, onSnapshot, getDocs, getDoc,
  addDoc, setDoc, updateDoc, deleteDoc,
  increment, serverTimestamp, query, orderBy
} from 'firebase/firestore';
// 관리자 비밀번호 (간단 게이트)
const ADMIN_PASS = '43210668';
 
const pointFields = ['출석','숙제','수업태도','시험','문제집완료'];

export default function App() {

  // ① 게이트 상태
const [authed, setAuthed] = useState(() => localStorage.getItem('adminAuthed') === '1');
const [pw, setPw] = useState('');
const [pwErr, setPwErr] = useState('');

// ② 로그인/로그아웃
const handleAdminLogin = () => {
  if (pw.trim() === ADMIN_PASS) {
     localStorage.setItem('adminAuthed', '1');
    setAuthed(true);
    setPw('');
    setPwErr('');
  } else {
    setPwErr('비밀번호가 올바르지 않습니다.');
  }
};
const handleLogout = () => {
  localStorage.removeItem('adminAuthed');
  setAuthed(false);
  setPw('');
  setPwErr('');
};

  // ── 탭: points | shopAdmin | shop | logs
  const [tab, setTab] = useState('points');

  // ── 공통 상태
  const [students, setStudents]     = useState([]);
  const [pointLogs, setPointLogs]   = useState([]);
  const [shopItems, setShopItems]   = useState([]);
  const [pointsMap, setPointsMap]   = useState({});   // { sid: {출석: n, ...} }
// ✅ 추가: 완북(books)용 상태
const [books, setBooks] = useState([]);
const [selectedBookSid, setSelectedBookSid] = useState('');

// 학생 선택 & 완북 입력값
const [selectedStudent, setSelectedStudent] = useState(null);
const [bookTitle, setBookTitle] = useState('');
const [bookGrade, setBookGrade] = useState('');
const [bookCompletedDate, setBookCompletedDate] = useState(
  new Date().toISOString().slice(0,10)
);
// 포인트 관리 탭: 선택 학생 + 페이지네이션

const [pointLogsPage, setPointLogsPage] = useState(1);
const POINT_LOGS_PAGE_SIZE = 10;


  // ── 스냅샷
  const [savepoints, setSavepoints]         = useState([]);
  const [selectedSaveDate, setSelectedSaveDate] = useState('');

  // ── 상점관리 입력
 const [newItem, setNewItem] = useState({ name:'', point:'' });

  // ── 상점(사용) 모달
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen]       = useState(false);
  const [authCode, setAuthCode]         = useState('');
  const [verifiedStudent, setVerifiedStudent] = useState(null);

  // ── 사용내역 삭제 모달
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetLog, setDeleteTargetLog] = useState(null);
  const [deletePassword, setDeletePassword]   = useState('');

  // ── 구독
  useEffect(() => {
  if (!authed) return;
  return onSnapshot(collection(db, 'students'), qs => {
    const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    setStudents(list);
    const m = {};
    list.forEach(s => { m[s.id] = s.points || {}; });
    setPointsMap(m);
    });
  }, [authed]);

useEffect(() => {
  if (!authed) return;
  const q = collection(db, 'point_logs'); // (서버 정렬 없이 클라 정렬)
  return onSnapshot(q, qs => {
    const list = qs.docs.map(d => {
      const data = d.data();
      const ts = data.createdAt;
      const ms = ts?.toMillis ? ts.toMillis() : (ts ? Date.parse(ts) : 0);
      return { id: d.id, ...data, _createdAtMs: ms };
    });
    setPointLogs(list);
});
}, [authed]);

 useEffect(() => {
 if (!authed) return;
  return onSnapshot(collection(db, 'point_shop'), qs => {
    setShopItems(qs.docs.map(d => ({ id: d.id, ...d.data() })));
 });
}, [authed]);

  // 저장본 목록 1회 로드
useEffect(() => {
  if (!authed) return;
  (async () => {
    const snap = await getDocs(collection(db, 'savepoint'));
    const list = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b)=>b.id.localeCompare(a.id));
    setSavepoints(list);
    if (list.length && !selectedSaveDate) setSelectedSaveDate(list[0].id);
  })();
}, [authed]);

// ✅ 추가: books 구독
useEffect(() => {
  if (!authed) return;
  return onSnapshot(collection(db, 'books'), qs => {
    setBooks(qs.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}, [authed]);

useEffect(() => {
  if (!selectedStudent && students.length) setSelectedStudent(students[0]);
}, [students, selectedStudent]);


// =====================
// books 동시 반영 유틸
// (루트 books + books_student/{sid}/books)
// =====================
const upsertBookBoth = async ({ id, studentId, payload }) => {
  // 1) 루트 books
  if (id) {
    await updateDoc(doc(db, 'books', id), payload);
  } else {
    const ref = await addDoc(collection(db, 'books'), payload);
    id = ref.id;
  }
  // 2) per-student books
  if (studentId) {
    await setDoc(
      doc(db, 'books_student', studentId, 'books', id),
      {
        ...payload,
        studentId,
        rootPath: `books/${id}`,
        migratedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  return id;
};

const deleteBookBoth = async (book) => {
  const id = book.id;
  const sid = book.studentId || '';
  try { await deleteDoc(doc(db, 'books', id)); } catch (_) {}
  try { if (sid) await deleteDoc(doc(db, 'books_student', sid, 'books', id)); } catch (_) {}
};

const handleEditBook = async (book) => {
  const newTitle = prompt('책 제목', book.title);
  const newGrade = prompt('학년', book.grade);
  const newDate  = prompt('완료일 (YYYY-MM-DD)', book.completedDate);
  if (!newTitle || !newGrade || !newDate) return;

  await upsertBookBoth({
    id: book.id,
    studentId: book.studentId,
    payload: { title: newTitle, grade: newGrade, completedDate: newDate }
  });

  alert('책 정보가 수정되었습니다.');
};


  // ── 유틸
  const getTotal = (s) =>
    pointFields.reduce((sum, k) => sum + (pointsMap[s.id]?.[k] || 0), 0);

  const sortedStudents = useMemo(
    () => [...students].sort((a,b)=>a.name.localeCompare(b.name)),
    [students]
  );

  // ─────────────────────────────────────────
  // 포인트 증감/가용 조정
  // ─────────────────────────────────────────
  const adjustPoint = async (student, field, delta) => {
    await updateDoc(doc(db, 'students', student.id), {
      [`points.${field}`]: increment(delta),
      totalPoints: increment(delta),
      availablePoints: increment(delta),
    });
  };
  const adjustAvailable = async (student, delta) => {
    await updateDoc(doc(db, 'students', student.id), {
      availablePoints: increment(delta),
    });
  };
// 모든 사용내역 최신순(내림차순)
const sortedLogsAll = useMemo(
  () => [...pointLogs].sort((a,b) => (b._createdAtMs || 0) - (a._createdAtMs || 0)),
  [pointLogs]
);

  // ─────────────────────────────────────────
  // 스냅샷 저장/리셋/복원
  // ─────────────────────────────────────────
  const handleSavePoints = async () => {
    if (!confirm('현재 모든 학생의 포인트 스냅샷을 저장할까요?')) return;
    const today = new Date().toISOString().slice(0,10);



    // 사용내역 묶기
 const bySid = pointLogs.reduce((acc, L) => {
  if (!L.studentId) return acc;
  const created = L.createdAt?.toDate
    ? L.createdAt.toDate()
    : (L.createdAt ? new Date(L.createdAt) : null);
  (acc[L.studentId] ||= []).push({
    item:  L.item || '',
    point: Number(L.point)||0,
    date:  L.date || (created ? created.toISOString().slice(0,10) : ''),
    time:  L.time || (created ? created.toISOString().slice(11,16) : ''),
  });
  return acc;
}, {});

    const data = {};
    students.forEach(s => {
      const categories = pointFields.reduce((o,k) => {
        o[k] = pointsMap[s.id]?.[k] || 0; return o;
      }, {});
      const total = Object.values(categories).reduce((a,b)=>a+(b||0),0);
      const usedLogs = bySid[s.id] || [];
      const usedPoints = usedLogs.reduce((sum,l)=>sum+(Number(l.point)||0),0);

      data[s.name] = {
        name: s.name,
        totalPoints: total,
        availablePoints: s.availablePoints || 0,
        usedPoints, usedLogs, categories
      };
    });

    await setDoc(doc(db, 'savepoint', today), {
      createdAt: serverTimestamp(),
      data
    });

    alert(`✅ ${today} 스냅샷 저장 완료`);
    // 리스트 갱신
    const snap = await getDocs(collection(db, 'savepoint'));
    const list = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b)=>b.id.localeCompare(a.id));
    setSavepoints(list);
    setSelectedSaveDate(today);
  };

  const handleResetPoints = async () => {
    if (!confirm('⚠️ 모든 학생의 포인트/가용포인트 및 point_logs를 초기화할까요?')) return;

    // 학생 포인트 리셋
    for (const s of students) {
      await updateDoc(doc(db, 'students', s.id), {
        points: { 출석:0, 숙제:0, 수업태도:0, 시험:0, 문제집완료:0 },
        totalPoints: 0,
        availablePoints: 0
      });
    }
    // 로그 삭제
    for (const L of pointLogs) {
      try { await deleteDoc(doc(db, 'point_logs', L.id)); } catch(e){}
    }
    alert('🧹 초기화 완료');
  };

  const handleRestorePoints = async () => {
    if (!selectedSaveDate) return alert('복원할 저장본 날짜를 선택하세요.');
    if (!confirm(`🔁 ${selectedSaveDate} 저장본으로 복원할까요? (기존 point_logs 삭제 후 저장본 usedLogs로 대체)`)) return;

    const snap = await getDoc(doc(db, 'savepoint', selectedSaveDate));
    if (!snap.exists()) return alert('저장본을 찾지 못했습니다.');
    const { data } = snap.data() || {};
    if (!data) return alert('저장 데이터가 비었습니다.');

    // 로그 전체 삭제
    for (const L of pointLogs) {
      try { await deleteDoc(doc(db, 'point_logs', L.id)); } catch(e){}
    }

    // 학생별 복원
    for (const s of students) {
      const saved = data[s.name];
      if (!saved) continue;

      const categories = saved.categories && typeof saved.categories === 'object'
        ? saved.categories
        : { 출석: saved.totalPoints||0, 숙제:0, 수업태도:0, 시험:0, 문제집완료:0 };

      await updateDoc(doc(db, 'students', s.id), {
        points: categories,
        totalPoints: saved.totalPoints || 0,
        availablePoints: saved.availablePoints ?? (saved.totalPoints || 0)
      });

      if (Array.isArray(saved.usedLogs)) {
        for (const L of saved.usedLogs) {
     await addDoc(collection(db, 'point_logs'), {
       studentId: s.id,
       name: s.name,
       item: L.item || '',
       point: Number(L.point) || 0,
       date: L.date || new Date().toISOString().slice(0,10),
       time: L.time || new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false }),
       createdAt: serverTimestamp(),
     });

        }
      }
    }
    alert(`✅ ${selectedSaveDate} 복원 완료`);
  };
// 선택 학생의 사용내역(최신순)
const logsForSelectedStudent = useMemo(() => (
  selectedStudent ? sortedLogsAll.filter(l => l.studentId === selectedStudent.id) : sortedLogsAll
), [sortedLogsAll, selectedStudent]);

// 선택 학생의 사용 포인트(차감 합계)
const usedSumForSelected = useMemo(
  () => logsForSelectedStudent.reduce((sum, l) => sum + (Number(l.point) || 0), 0),
  [logsForSelectedStudent]
);


const totalPointLogsPages = Math.max(1, Math.ceil(logsForSelectedStudent.length / POINT_LOGS_PAGE_SIZE));
useEffect(() => {
  if (pointLogsPage > totalPointLogsPages) setPointLogsPage(totalPointLogsPages);
}, [totalPointLogsPages, pointLogsPage]);

const pagedPointLogs = useMemo(() => {
  const start = (pointLogsPage - 1) * POINT_LOGS_PAGE_SIZE;
  return logsForSelectedStudent.slice(start, start + POINT_LOGS_PAGE_SIZE);
}, [logsForSelectedStudent, pointLogsPage]);

  // ─────────────────────────────────────────
  // 상점(관리) CRUD
  // ─────────────────────────────────────────
  const handleAddItem = async () => {
  const { name, point } = newItem;
  if (!name || !point) return alert('이름/포인트를 입력하세요.');

  await addDoc(collection(db, 'point_shop'), {
    name,
    point: Number(point),
    createdAt: new Date().toISOString(),
  });

  setNewItem({ name: '', point: '' });
};

  const handleEditItem = async (item) => {
     const name = prompt('상품명', item.name);
  const point = prompt('필요 포인트', item.point);
  if (!name || !point) return;
  await updateDoc(doc(db, 'point_shop', item.id), { name, point: Number(point) });
};
 
  const handleDeleteItem = async (id) => {
    if (!confirm('정말 삭제할까요?')) return;
    await deleteDoc(doc(db, 'point_shop', id));
  };

  // ─────────────────────────────────────────
  // 상점(사용)
  // ─────────────────────────────────────────
  const handleConfirmUse = async () => {
    if (!selectedItem) return;

    // 생일4 + 부모번호4 (예: 0606 + 1234 → "06061234")
    const student = students.find(s => {
      const b = (s.birth||'').slice(-4);
      const p = (s.parentPhone||'').slice(-4);
      return (b + p) === authCode;
    });
    if (!student) {
      alert('학생 인증 실패');
      return;
    }
    if ((student.availablePoints || 0) < selectedItem.point) {
      alert('포인트 부족');
      return;
    }
    if (!window.confirm(`${selectedItem.point}pt 사용할까요?`)) return;

  // 1) 로그 추가 (시간까지 저장, createdAt은 서버타임스탬프)
try {
  await addDoc(collection(db, 'point_logs'), {
  studentId: student.id,
  name: student.name,
  item: selectedItem.name,
  point: Number(selectedItem.point),
  date: new Date().toISOString().slice(0,10),
  time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false }),
  createdAt: serverTimestamp(),
});
} catch (e) {
  console.error(e);
  alert('사용내역 저장 실패: ' + (e?.message || e));
  return;
}


    // 2) 포인트 차감 (원자적)
    await updateDoc(doc(db, 'students', student.id), {
      availablePoints: increment(-Number(selectedItem.point))
    });

    setModalOpen(false);
    setAuthCode('');
    setVerifiedStudent(student);
    setTimeout(() => setVerifiedStudent(null), 4000);
  };

  // ─────────────────────────────────────────
  // 사용내역 삭제(복원)
  // ─────────────────────────────────────────
  const handleDeleteLog = (log) => {
    setDeleteTargetLog(log);
    setDeletePassword('');
    setDeleteModalOpen(true);
  };
  const confirmDeleteLog = async () => {
    if (deletePassword !== ADMIN_PASS) {
      alert('비밀번호 틀림');
      return;
    }
    const log = deleteTargetLog;
    if (!log) return;
    const student = students.find(s => s.id === log.studentId);
    // 로그 지우고 포인트 복원
    await deleteDoc(doc(db, 'point_logs', log.id));
    if (student) {
      await updateDoc(doc(db, 'students', student.id), {
        availablePoints: increment(Number(log.point) || 0)
      });
    }
    setDeleteModalOpen(false);
  };

// ✅ 완북리스트를 학생별로 그룹핑
const bookBySid = useMemo(() => {
  const m = {};
  books.forEach(b => {
    const sid = b.studentId || '';
    if (!m[sid]) {
      m[sid] = {
        name: b.name || (students.find(s => s.id === sid)?.name) || '이름없음',
        count: 0,
        items: []
      };
    }
    m[sid].count++;
    m[sid].items.push(b);
  });
  return m;
}, [books, students]);

// 선택 학생의 포인트사용내역(최신순)
const logsForSelected = useMemo(() => {
  const base = [...pointLogs].sort((a,b)=>(b._createdAtMs||0)-(a._createdAtMs||0));
  return selectedStudent ? base.filter(l => l.studentId === selectedStudent.id) : base;
}, [pointLogs, selectedStudent]);

// 선택 학생의 완북 목록(완료일 내림차순)
const booksOfSelected = useMemo(() => {
  if (!selectedStudent) return [];
  return books
    .filter(b => b.studentId === selectedStudent.id)
    .sort((a,b) => (b.completedDate||'').localeCompare(a.completedDate||''));
}, [books, selectedStudent]);



// ✅ 왼쪽 목록용(이름순)
const bookList = useMemo(
  () => Object.entries(bookBySid)
        .map(([sid, v]) => ({ sid, ...v }))
        .sort((a,b) => a.name.localeCompare(b.name)),
  [bookBySid]
);

// ✅ 오른쪽 사용내역: 최신순 + (선택 시) 학생 필터
const logsSorted = useMemo(
  () => [...pointLogs].sort((a,b) => (b._createdAtMs||0) - (a._createdAtMs||0)),
  [pointLogs]
);
const shownLogs = useMemo(
  () => selectedBookSid ? logsSorted.filter(l => l.studentId === selectedBookSid) : logsSorted,
  [logsSorted, selectedBookSid]
);



if (!authed) {
  return (
    <div className="container" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="card" style={{ maxWidth:420, width:'100%', padding:24 }}>
        <div className="h1" style={{ marginBottom:8 }}>관리자 전용</div>
        <div style={{ color:'#6b7280', marginBottom:12 }}>비밀번호를 입력하세요.</div>
        <input
          className="select"
          type="password"
          placeholder="관리자 비밀번호"
          value={pw}
          onChange={e=>{ setPw(e.target.value); setPwErr(''); }}
          onKeyDown={e=>{ if (e.key==='Enter') handleAdminLogin(); }}
        />
        {pwErr && <div style={{ color:'#ef4444', fontSize:12, marginTop:6 }}>{pwErr}</div>}
        <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
          <button className="btn" onClick={handleAdminLogin}>입장</button>
        </div>
      </div>
    </div>
  );
}



  // ─────────────────────────────────────────
  // 뷰
  // ─────────────────────────────────────────
  return (
    <div className="container">
     <div className="row" style={{ justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
   <div className="h1" style={{ margin:0 }}>포인트 전용 관리자</div>
   <button className="btn outline" onClick={handleLogout}>로그아웃</button>
 </div>
      {/* 탭 */}
      <div className="row" style={{ marginBottom: 16, flexWrap:'wrap', gap:8 }}>
        <button className="btn" onClick={()=>setTab('points')}    style={{ fontWeight: tab==='points'?'700':'500' }}>포인트 관리</button>
        <button className="btn" onClick={()=>setTab('shopAdmin')} style={{ fontWeight: tab==='shopAdmin'?'700':'500' }}>포인트 상점관리</button>
        <button className="btn" onClick={()=>setTab('shop')}      style={{ fontWeight: tab==='shop'?'700':'500' }}>포인트상점</button>
        <button className="btn" onClick={()=>setTab('logs')}      style={{ fontWeight: tab==='logs'?'700':'500' }}>포인트사용내역</button>
      <button className="btn" onClick={()=>setTab('books')} style={{ fontWeight: tab==='books'?'700':'500' }}>
  완북리스트
</button>

      </div>

      {/* ────────────── 포인트 관리 ────────────── */}
     {tab === 'points' && (
  <div className="row" style={{ alignItems:'flex-start', gap:16 }}>
    {/* ── 좌측: 학생 리스트 ───────────────────────── */}
    <div className="card" style={{ flex:'0 0 260px', padding:16, maxHeight:'70vh', overflow:'auto' }}>
      <div className="row" style={{ justifyContent:'space-between', marginBottom:8 }}>
        <div className="h2">학생</div>
        <div className="muted">{sortedStudents.length}명</div>
      </div>
      <ul className="column" style={{ gap:8 }}>
        {sortedStudents.map(s => (
          <li key={s.id}>
            <button
              className="btn"
              style={{
                width:'100%',
                justifyContent:'space-between',
                fontWeight: selectedStudent?.id === s.id ? 700 : 500
              }}
              onClick={() => { setSelectedStudent(s); setPointLogsPage(1); }}
            >
              <span>{s.name}</span>
          
            </button>
          </li>
        ))}
      </ul>
    </div>

    {/* ── 우측: 상단 포인트 조정(카테고리별 ±) + 하단 사용내역(10개씩) ───────────────── */}
    <div className="card" style={{ flex:1, padding:16 }}>
      {/* 상단: 카테고리별 ± */}
       <div className="row" style={{ justifyContent:'space-between', marginBottom:12, alignItems:'center' }}>
   <div className="row" style={{ gap:8, alignItems:'center' }}>
     <div className="h2" style={{ margin:0 }}>
       {selectedStudent ? selectedStudent.name : '학생 선택'}
     </div>
     {selectedStudent && (
       <>
         <span className="badge">총 {getTotal(selectedStudent)}pt</span>
         <span className="badge">가용 {selectedStudent.availablePoints || 0}pt</span>
         <span className="badge">사용 {usedSumForSelected}pt</span>
       </>
     )}
   </div>
   {selectedStudent && (
     <div className="row" style={{ gap:8, flexWrap:'wrap' }}>
       {pointFields.map(f => (
         <div key={f} className="row" style={{ gap:6, alignItems:'center' }}>
           <span className="badge" title={f}>
             {f}: {pointsMap[selectedStudent.id]?.[f] || 0}
           </span>
           <button className="btn" onClick={()=>adjustPoint(selectedStudent, f, +1)}>+1</button>
           <button className="btn destructive" onClick={()=>adjustPoint(selectedStudent, f, -1)}>-1</button>
         </div>
       ))}
     </div>
   )}
 </div>

      {/* 하단: 사용내역(10개씩) */}
      <div className="card" style={{ padding:12 }}>
        <div className="row" style={{ justifyContent:'space-between', marginBottom:8 }}>
          <div className="h2" style={{ fontSize:16 }}>사용내역</div>
          <div className="muted">
            {selectedStudent ? `${selectedStudent.name} · ` : '전체 · '}
            총 {logsForSelectedStudent.length}건
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>시간</th>
              <th>이름</th>
              <th>항목</th>
              <th>포인트</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {pagedPointLogs.map(log => (
              <tr key={log.id}>
                <td>{(log.date||'') + ' ' + (log.time||'')}</td>
                <td>{log.name}</td>
                <td>{log.item}</td>
                <td>-{log.point}</td>
                <td>
                  <button className="btn destructive" onClick={() => handleDeleteLog(log)}>삭제/복원</button>
                </td>
              </tr>
            ))}
            {pagedPointLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500">내역 없음</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 페이지네이션 */}
        <div className="row" style={{ justifyContent:'flex-end', gap:8, marginTop:8 }}>
          <button className="btn outline"
                  disabled={pointLogsPage<=1}
                  onClick={()=>setPointLogsPage(p=>Math.max(1, p-1))}>
            이전
          </button>
          <span className="badge">{pointLogsPage} / {totalPointLogsPages}</span>
          <button className="btn outline"
                  disabled={pointLogsPage>=totalPointLogsPages}
                  onClick={()=>setPointLogsPage(p=>Math.min(totalPointLogsPages, p+1))}>
            다음
          </button>
        </div>
      </div>
    </div>
  </div>
)}


      {/* ────────────── 포인트 상점관리 (CRUD) ────────────── */}
      {tab === 'shopAdmin' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="row" style={{ justifyContent:'space-between', marginBottom: 12 }}>
            <div className="badge">상품 등록</div>
          </div>
          <div style={{ display:'grid', gap: 10, marginBottom: 24 }}>
            <input className="select" placeholder="상품명"
                   value={newItem.name} onChange={e=>setNewItem(p=>({ ...p, name:e.target.value }))}/>
            <input className="select" placeholder="필요 포인트"
                   value={newItem.point} onChange={e=>setNewItem(p=>({ ...p, point:e.target.value }))}/>
           
            <button className="btn" onClick={handleAddItem}>등록</button>
          </div>

         <div className="badge">상품 목록</div>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
               <th>상품명</th><th>포인트</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
            {shopItems.map(it => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td>{it.point}</td>
                <td>
                  <div className="row">
                    <button className="btn outline" onClick={()=>handleEditItem(it)}>수정</button>
                    <button className="btn destructive" onClick={()=>handleDeleteItem(it.id)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ────────────── 포인트상점 (사용) ────────────── */}
      {tab === 'shop' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="badge" style={{ marginBottom: 12 }}>상품</div>
          <div style={{ display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))' }}>
            {shopItems.sort((a,b)=>a.point-b.point).map(item => (
              <div key={item.id} className="card" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name}
                       style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8 }} />
                ) : null}
                <div style={{ fontWeight:700 }}>{item.name}</div>
                <div className="badge">{item.point}pt</div>
                <button className="btn" style={{ marginTop:'auto' }}
                        onClick={()=>{ setSelectedItem(item); setModalOpen(true); }}>
                  사용하기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ────────────── 포인트사용내역 ────────────── */}
      {tab === 'logs' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="badge" style={{ marginBottom:12 }}>사용 내역</div>
          <div style={{ display:'grid', gap:8 }}>

            {[...pointLogs].sort((a,b)=> (b._createdAtMs||0) - (a._createdAtMs||0)).map(log => {
    const timeText = log.time
      || (log._createdAtMs ? new Date(log._createdAtMs).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false}) : '');
    return (
              <div key={log.id}
                   className="row"
                   style={{ justifyContent:'space-between', background:'#f9fafb', padding:10, borderRadius:8, border:'1px solid #eee' }}>
                <div>
                  <div style={{ fontWeight:600 }}>{log.name}</div>
                  <div style={{ fontSize:13, color:'#555' }}>{log.item} · {log.point}pt</div>
                 <div style={{ fontSize:12, color:'#999' }}>{log.date} {timeText}</div>
                </div>
                <button className="btn destructive" onClick={()=>handleDeleteLog(log)}>삭제</button>
              </div>
          )})}
          </div>
        </div>
      )}

      {/* ── 상점 사용 모달 */}
      {modalOpen && (
        <div className="fixed inset-0" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)',
              display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ maxWidth:380, width:'100%', padding:16 }}>
            <div className="h1" style={{ fontSize:18, marginBottom:8 }}>학생 인증</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:8 }}>생일4자리 + 부모번호4자리 (예: 06061234)</div>
            <input className="select" value={authCode} onChange={e=>setAuthCode(e.target.value)} placeholder="8자리" />
            <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
              <button className="btn outline" onClick={()=>{ setModalOpen(false); setAuthCode(''); }}>취소</button>
              <button className="btn" onClick={handleConfirmUse}>확인</button>
            </div>
            {verifiedStudent && (
              <div style={{ marginTop:8, color:'#16a34a' }}>{verifiedStudent.name}님 사용 완료!</div>
            )}
          </div>
        </div>
      )}

      {/* ── 사용내역 삭제 모달 */}
      {deleteModalOpen && (
        <div className="fixed inset-0" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)',
              display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div className="card" style={{ maxWidth:380, width:'100%', padding:16 }}>
            <div className="h1" style={{ fontSize:18, marginBottom:8 }}>로그 삭제</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:8 }}>관리자 비밀번호 입력</div>
            <input className="select" type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} />
            <div className="row" style={{ justifyContent:'flex-end', marginTop:12 }}>
              <button className="btn outline" onClick={()=>setDeleteModalOpen(false)}>취소</button>
              <button className="btn destructive" onClick={confirmDeleteLog}>삭제</button>
            </div>
          </div>
        </div>
      )}

     {tab === 'books' && (
  <div className="row" style={{ alignItems:'flex-start', gap:16 }}>
    {/* ── 왼쪽: 학생 이름 리스트 ───────────────────────── */}
    <div className="card" style={{ flex:'0 0 280px', padding:16, maxHeight:'70vh', overflow:'auto' }}>
      <div className="h2" style={{ marginBottom:8 }}>학생</div>
      {sortedStudents.length === 0 && <div className="muted">학생이 없습니다.</div>}
      <ul className="column" style={{ gap:8 }}>
        {sortedStudents.map(s => (
          <li key={s.id}>
            <button
              className="btn"
              style={{
                width:'100%',
                justifyContent:'space-between',
                fontWeight: selectedStudent?.id === s.id ? 700 : 500
              }}
              onClick={() => setSelectedStudent(s)}
              title={s.name}
            >
              <span>{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>

    {/* ── 오른쪽: 포인트사용내역 + 완북리스트 ─────────────────── */}
    <div style={{ flex:1, display:'grid', gap:16 }}>
     

      {/* ② 완북리스트 (폼 + 표) */}
      <div className="card" style={{ padding:16 }}>
        <div className="h2" style={{ marginBottom:8 }}>완북리스트</div>

        {/* 입력 폼 */}
        <div className="column" style={{ gap:8, marginBottom:12 }}>
          <input
            className="select"
            placeholder="책 이름"
            value={bookTitle}
            onChange={e => setBookTitle(e.target.value)}
          />
          <input
            className="select"
            placeholder="학년"
            value={bookGrade}
            onChange={e => setBookGrade(e.target.value)}
          />
          <input
            className="select"
            type="date"
            value={bookCompletedDate}
            onChange={e => setBookCompletedDate(e.target.value)}
          />
          <button
            className="btn"
            onClick={async () => {
  if (!selectedStudent) return alert('왼쪽에서 학생을 먼저 선택하세요!');
  if (!bookTitle || !bookGrade) return alert('책 이름과 학년을 입력하세요!');

  const payload = {
    studentId: selectedStudent.id,
    name: selectedStudent.name,
    title: bookTitle,
    grade: bookGrade,
    completedDate: bookCompletedDate,
  };

  await upsertBookBoth({ id: null, studentId: selectedStudent.id, payload });

  setBookTitle('');
  setBookGrade('');
  alert('저장되었습니다!');
}}

          >
            저장
          </button>
        </div>

        {/* 저장된 책 목록 */}
        <table className="table">
          <thead>
            <tr>
              <th>번호</th>
              <th>책 이름</th>
              <th>학년</th>
              <th>완료일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {booksOfSelected.map((book, idx) => (
              <tr key={book.id}>
                <td>{idx + 1}</td>
                <td>{book.title}</td>
                <td>{book.grade}</td>
                <td>{book.completedDate}</td>
                <td>
                  <div className="row" style={{ gap:8 }}>
                    <button className="btn outline" onClick={() => handleEditBook(book)}>수정</button>
                    <button
                      className="btn destructive"
                      onClick={async () => {
                        if (window.confirm('삭제하시겠습니까?')) {
                          await deleteBookBoth(book);
                        }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {booksOfSelected.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500">저장된 책이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)}


    </div>
  );
}
