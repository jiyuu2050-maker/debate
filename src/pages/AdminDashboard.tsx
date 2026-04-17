import React, { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { Student, Lesson } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Users, Play, Square, Save, Trash2, LogOut, LayoutDashboard, Key, Download, Target, FileText, BarChart3, ShieldCheck, ArrowLeft, Swords } from 'lucide-react';
import Papa from 'papaparse';
import { onSnapshot } from 'firebase/firestore';

type AdminSection = 'class' | 'lesson' | 'test' | 'ai' | 'stats' | 'password';

export default function AdminDashboard() {
  const { user, isAdmin, lesson, loading } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSection>('lesson');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  const [gameType, setGameType] = useState<'post-it' | 'pet-battle'>('pet-battle');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [inputPassword, setInputPassword] = useState('');
  const [storedAdminPassword, setStoredAdminPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [csvEncoding, setCsvEncoding] = useState<string>('UTF-8');
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  useEffect(() => {
    // Fetch global config
    const unsub = onSnapshot(doc(db, 'config', 'admin'), (snap) => {
       if (snap.exists()) {
          setStoredAdminPassword(snap.data().adminPassword || import.meta.env.VITE_INITIAL_ADMIN_PASSWORD || '');
       } else {
          setStoredAdminPassword(import.meta.env.VITE_INITIAL_ADMIN_PASSWORD || '');
       }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (lesson) {
      setTopic(lesson.topic || '');
      setMode(lesson.mode || 'individual');
      setGameType(lesson.gameType || 'pet-battle');
    }
  }, [lesson]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center gap-4">
      <div className="w-12 h-12 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin"></div>
      <div className="font-bold text-gray-500">정보를 불러오는 중입니다...</div>
    </div>
  );

  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#f7f7f2] font-sans text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-12 rounded-[3rem] shadow-xl w-full max-w-md border border-gray-100"
        >
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
             <ShieldCheck size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">권한이 없습니다</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            관리자 대시보드는 지정된 관리자 계정<br/>
            <span className="font-bold text-[#555843]">(jiyuu2050@gmail.com)</span><br/>
            으로만 접근할 수 있습니다.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-4 bg-[#555843] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
          >
            <ArrowLeft size={20} /> 처음으로 돌아가기
          </button>
          
          {user && (
            <button 
              onClick={() => signOut(auth).then(() => navigate('/'))}
              className="mt-6 text-xs text-gray-400 underline"
            >
              다른 계정으로 로그인
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const downloadTemplate = () => {
    const csvContent = "반,번호,이름\n1,1,홍길동\n1,2,김철수";
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "argu_mon_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) return;
    try {
      await setDoc(doc(db, 'config', 'admin'), { adminPassword: newPassword });
      alert('비밀번호가 변경되었습니다!');
      setNewPassword('');
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'config/admin');
    }
  };

  const startVirtualTest = async (path: string) => {
    if (!user) return;
    
    try {
      // Create/Update a virtual student linked to current admin UID
      const virtualId = 'virtual-admin-test';
      await setDoc(doc(db, 'students', virtualId), {
        id: virtualId,
        class: '가상',
        number: '0',
        name: '가상 학생(관리자)',
        emoji: '🧪',
        hp: 100,
        lastActive: new Date().toISOString(),
        role: 'student',
        uid: user.uid
      });
      navigate(path);
    } catch (error) {
      console.error('Virtual test start failed:', error);
      alert('가상 테스트 시작 중 오류가 발생했습니다.');
    }
  };

  const handleCsvUpload = (e: ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0];
    if (!file) return;

    setLastUploadedFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: csvEncoding,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        console.log('CSV Parse complete. Headers:', Object.keys(results.data[0] || {}), 'Encoding:', csvEncoding);
        setCsvData(results.data);
      },
      error: (error) => {
        alert('CSV 파일을 읽는 중 오류가 발생했습니다: ' + error.message);
      }
    });
  };

  // Re-parse when encoding changes if we have a file
  useEffect(() => {
    if (lastUploadedFile) {
      handleCsvUpload(lastUploadedFile);
    }
  }, [csvEncoding]);

  const saveStudents = async () => {
    if (!csvData || csvData.length === 0) {
      alert('등록할 데이터가 없습니다.');
      return;
    }

    setUploading(true);
    try {
      const batch = writeBatch(db);
      let validCount = 0;

      csvData.forEach((row: any) => {
        // Find values by checking common header variations
        const getVal = (keys: string[]) => {
          const foundKey = Object.keys(row).find(k => keys.includes(k.trim()));
          return foundKey ? String(row[foundKey] || '').trim() : '';
        };

        const classVal = getVal(['반', 'class', 'grade', 'Grade']);
        const numberVal = getVal(['번호', 'number', 'no', 'No', 'Number']);
        const nameVal = getVal(['이름', 'name', 'Name']);

        // Basic validation: must have at least name and either class or number
        // (Previously it required all 3, but let's be slightly more flexible or warn)
        if (!nameVal || !classVal || !numberVal) {
          console.warn('Skipping invalid row during save:', row);
          return;
        }

        const id = `${classVal}-${numberVal}`;
        const studentRef = doc(db, 'students', id);
        
        batch.set(studentRef, {
          id,
          class: classVal,
          number: numberVal,
          name: nameVal,
          emoji: '🦖',
          hp: 100,
          lastActive: new Date().toISOString(),
          role: 'student',
          uid: '' // Initialize UID as empty
        });
        validCount++;
      });

      if (validCount === 0) {
        // Debug first row to help user
        const firstRowKeys = csvData.length > 0 ? Object.keys(csvData[0]).join(', ') : '없음';
        throw new Error(`등록할 수 있는 유효한 학생 데이터가 없습니다.\n인식된 항목명(Header): [${firstRowKeys}]\n\n'반', '번호', '이름' 항목이 정확히 포함되어 있는지 확인해 주세요.`);
      }

      await batch.commit();
      alert(`${validCount}명의 학생 명단이 등록되었습니다!`);
      setCsvData([]);
    } catch (error: any) {
      console.error('Save error:', error);
      alert('저장 실패: ' + (error.message || '알 수 없는 오류'));
    } finally {
      setUploading(false);
    }
  };

  const updateLesson = async (status: 'ready' | 'started' | 'finished') => {
    try {
      await setDoc(doc(db, 'lessons', 'current'), {
        topic,
        mode,
        gameType,
        status,
        startedAt: status === 'started' ? new Date().toISOString() : lesson?.startedAt
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'lessons/current');
    }
  };

  const clearAllStudents = async () => {
     if (!confirm('정말로 모든 학생 데이터를 삭제하시겠습니까?')) return;
     try {
       const q = collection(db, 'students');
       const snap = await getDocs(q);
       const batch = writeBatch(db);
       snap.docs.forEach(d => batch.delete(d.ref));
       await batch.commit();
       alert('모든 학생 명단이 초기화되었습니다.');
       setCsvData([]);
     } catch (e) {
       console.error(e);
       alert('초기화 중 오류가 발생했습니다.');
     }
  };

  const SidebarItem = ({ id, icon: Icon, label, color = "text-gray-500" }: { id: AdminSection, icon: any, label: string, color?: string }) => {
    const isActive = activeSection === id;
    return (
      <button
        onClick={() => setActiveSection(id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
          isActive 
            ? 'bg-[#555843] text-white shadow-lg' 
            : `text-gray-500 hover:bg-gray-100`
        }`}
      >
        <Icon size={20} className={isActive ? 'text-white' : color} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#f1f3f5] font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col p-6 overflow-y-auto shrink-0">
        <div className="mb-10 px-2">
          <h1 className="text-2xl font-serif italic font-bold tracking-tight text-[#555843]">Battlefield Admin</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem id="class" icon={Users} label="학급 관리" />
          <SidebarItem id="lesson" icon={Play} label="수업 관리" />
          <SidebarItem id="test" icon={Target} label="가상 테스트" />
          <SidebarItem id="ai" icon={FileText} label="AI 생기부" />
          <SidebarItem id="stats" icon={BarChart3} label="통계" />
          <SidebarItem id="password" icon={ShieldCheck} label="암호 변경" />
        </nav>

        <div className="mt-10 pt-6 border-t border-gray-50">
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut size={20} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <div className="mb-4">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-gray-400 hover:text-[#555843] transition-colors text-sm font-bold"
          >
            <ArrowLeft size={18} /> 어드민 종료
          </button>
        </div>

        <header className="mb-8">
          <h2 className="text-3xl font-black text-[#002d4a] tracking-tight">
            {activeSection === 'class' && '학급 관리'}
            {activeSection === 'lesson' && '수업 관리'}
            {activeSection === 'test' && '가상 테스트'}
            {activeSection === 'ai' && 'AI 생기부'}
            {activeSection === 'stats' && '통계'}
            {activeSection === 'password' && '암호 변경'}
          </h2>
        </header>

        <div className="max-w-4xl">
          {activeSection === 'class' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-white">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Upload size={22} className="text-green-500" /> 명단 등록
                  </h3>
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl text-xs font-bold">
                    <button 
                      onClick={() => setCsvEncoding('UTF-8')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${csvEncoding === 'UTF-8' ? 'bg-white shadow-sm text-green-600' : 'text-gray-400'}`}
                    >UTF-8</button>
                    <button 
                      onClick={() => setCsvEncoding('CP949')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${csvEncoding === 'CP949' ? 'bg-white shadow-sm text-green-600' : 'text-gray-400'}`}
                    >EUC-KR / CP949 (Excel)</button>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-10 text-center hover:border-green-200 transition-all relative group bg-gray-50/50">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={handleCsvUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Upload className="mx-auto text-gray-300 mb-4 group-hover:text-green-300 transition-colors" size={48} />
                    <p className="text-lg font-bold text-gray-500">
                      {csvData.length > 0 ? `${csvData.length}명 로드됨` : 'CSV 파일 업로드'}
                    </p>
                    <p className="text-sm text-gray-400 mt-2">필수 항목: 반, 번호, 이름</p>
                  </div>

                  {/* Data Preview Area */}
                  {csvData.length > 0 && (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 max-h-48 overflow-y-auto">
                      <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">데이터 미리보기 (상위 3명)</p>
                      <table className="w-full text-left text-sm">
                        <thead className="text-gray-400 border-b">
                          <tr>
                            <th className="pb-2 font-medium">반</th>
                            <th className="pb-2 font-medium">번호</th>
                            <th className="pb-2 font-medium">이름</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.slice(0, 3).map((row: any, i) => {
                             const getVal = (keys: string[]) => {
                               const foundKey = Object.keys(row).find(k => keys.includes(k.trim()));
                               return foundKey ? String(row[foundKey] || '').trim() : '-';
                             };
                             return (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2">{getVal(['반', 'class', 'grade', 'Grade'])}</td>
                                <td className="py-2">{getVal(['번호', 'number', 'no', 'No', 'Number'])}</td>
                                <td className="py-2 font-bold">{getVal(['이름', 'name', 'Name'])}</td>
                              </tr>
                             );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-pink-500 mt-2 font-medium">
                        * 이름이 깨져 보인다면 상단의 인코딩 버튼(UTF-8/CP949)을 변경해 보세요.
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-4">
                    <button 
                      onClick={downloadTemplate}
                      className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-all"
                    >
                      <Download size={20} /> 양식 다운로드
                    </button>
                    {csvData.length > 0 && (
                      <button 
                        onClick={saveStudents}
                        disabled={uploading}
                        className="flex-[2] py-4 bg-green-600 text-white rounded-2xl font-black text-lg hover:bg-green-700 disabled:opacity-50 shadow-lg shadow-green-100"
                      >
                        {uploading ? '저장 중...' : '명단 저장하기'}
                      </button>
                    )}
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button 
                      onClick={clearAllStudents}
                      className="flex items-center justify-center gap-2 text-sm text-red-400 hover:text-red-600 font-bold transition-colors"
                    >
                      <Trash2 size={16} /> 전체 명단 초기화
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'lesson' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-white">
                <h3 className="text-xl font-bold mb-8 flex items-center gap-2">
                  <Play size={22} className="text-blue-500" /> 수업 설정
                </h3>
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-bold text-gray-400 mb-3 ml-1">토론 주제</label>
                    <input 
                      type="text"
                      placeholder="예: 초등학생의 스마트폰 사용은 제한되어야 한다."
                      className="w-full px-6 py-5 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-200 outline-none font-bold text-lg transition-all"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-400 mb-3 ml-1">게임 모드</label>
                      <div className="flex bg-gray-50 p-1.5 rounded-2xl">
                        <button 
                          onClick={() => setMode('individual')}
                          className={`flex-1 py-4 rounded-xl font-bold transition-all ${mode === 'individual' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
                        >개인전</button>
                        <button 
                          onClick={() => setMode('team')}
                          className={`flex-1 py-4 rounded-xl font-bold transition-all ${mode === 'team' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
                        >단체전</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-400 mb-3 ml-1">게임 종류</label>
                      <div className="flex bg-gray-50 p-1.5 rounded-2xl">
                        <button 
                          onClick={() => setGameType('post-it')}
                          className={`flex-1 py-4 rounded-xl font-bold transition-all ${gameType === 'post-it' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
                        >포스트잇</button>
                        <button 
                          onClick={() => setGameType('pet-battle')}
                          className={`flex-1 py-4 rounded-xl font-bold transition-all ${gameType === 'pet-battle' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
                        >펫 배틀</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6">
                    {lesson?.status === 'started' ? (
                      <button 
                        onClick={() => updateLesson('finished')}
                        className="flex-1 py-5 bg-red-100 text-red-600 rounded-2xl font-black text-xl flex items-center justify-center gap-3 hover:bg-red-200 transition-all border-2 border-transparent"
                      >
                        <Square size={24} fill="currentColor" /> 수업 종료
                      </button>
                    ) : (
                      <button 
                        onClick={() => updateLesson('started')}
                        className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all"
                      >
                        <Play size={24} fill="currentColor" /> 수업 시작!
                      </button>
                    )}
                    <button 
                      onClick={() => updateLesson(lesson?.status || 'ready')}
                      className="px-8 py-5 bg-gray-100 text-gray-500 rounded-2xl font-black hover:bg-gray-200 transition-all"
                    >
                      <Save size={24} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'test' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-white">
                <div className="flex items-center gap-4 mb-10">
                   <div className="p-4 bg-orange-100 rounded-3xl text-orange-600">
                      <Target size={32} />
                   </div>
                   <div>
                      <h3 className="text-2xl font-black text-gray-800">가상 시뮬레이션 테스트</h3>
                      <p className="text-gray-500 font-medium">실제 학생 명단이 없어도 수업 과정을 미리 테스트해볼 수 있습니다.</p>
                   </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <button 
                     onClick={() => navigate('/login')}
                     className="group p-8 bg-gray-50 rounded-[2rem] border-2 border-transparent hover:border-blue-200 transition-all text-left"
                   >
                      <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                         <Users size={24} />
                      </div>
                      <h4 className="text-xl font-bold mb-2">1단계: 로그인 테스트</h4>
                      <p className="text-sm text-gray-400 font-medium leading-relaxed">학생 로그인 화면으로 이동합니다. 명단이 있다면 직접 로그인해볼 수 있습니다.</p>
                   </button>

                   <button 
                     onClick={() => startVirtualTest('/student')}
                     className="group p-8 bg-gray-50 rounded-[2rem] border-2 border-transparent hover:border-pink-200 transition-all text-left"
                   >
                      <div className="w-12 h-12 bg-pink-100 rounded-2xl flex items-center justify-center text-pink-600 mb-6 group-hover:scale-110 transition-transform">
                         <FileText size={24} />
                      </div>
                      <h4 className="text-xl font-bold mb-2">2단계: 논증 워크스페이스</h4>
                      <p className="text-sm text-gray-400 font-medium leading-relaxed">학생이 논증을 작성하고 AI 채점을 받는 '나의 논증 빌더'를 직접 체험합니다.</p>
                   </button>

                   <button 
                     onClick={() => startVirtualTest('/battle')}
                     className="group p-8 bg-gray-50 rounded-[2rem] border-2 border-transparent hover:border-purple-200 transition-all text-left"
                   >
                      <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                         <Swords size={24} />
                      </div>
                      <h4 className="text-xl font-bold mb-2">3단계: 배틀 아레나</h4>
                      <p className="text-sm text-gray-400 font-medium leading-relaxed">논증 제출 후 입장하는 배틀장을 테스트합니다. (로컬 데이터로 시뮬레이션)</p>
                   </button>
                </div>

                <div className="mt-12 p-8 bg-blue-50/50 rounded-[2rem] border border-blue-100">
                   <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-500 shadow-sm shrink-0 mt-1">
                         <Play size={18} fill="currentColor" />
                      </div>
                      <div>
                         <h5 className="font-bold text-blue-900 mb-1">테스트 전 체크사항</h5>
                         <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside opacity-80">
                            <li>'수업 관리' 탭에서 수업 상태를 <b>[시작]</b>으로 설정해야 기능이 활성화됩니다.</li>
                            <li>명단이 없을 때는 관리자가 먼저 테스트 학생 정보를 생성하거나 데이터 미리보기를 활용하세요.</li>
                            <li>브라우저의 탭을 두 개 열어 '관리자'와 '학생' 역할을 동시에 수행하면 더 정확한 테스트가 가능합니다.</li>
                         </ul>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'ai' && (
             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-white text-center">
                <FileText size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-bold text-lg">AI 생기부 분석 기능이 곧 추가됩니다.</p>
             </motion.div>
          )}

          {activeSection === 'stats' && (
             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-12 rounded-[2.5rem] shadow-sm border border-white text-center">
                <BarChart3 size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-bold text-lg">실시간 통계 데이터가 준비 중입니다.</p>
             </motion.div>
          )}

          {activeSection === 'password' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-white">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <ShieldCheck size={22} className="text-orange-500" /> 관리자 비밀번호 변경
                </h3>
                <div className="space-y-6 max-w-md">
                   <div>
                     <label className="block text-xs font-bold text-gray-400 mb-2 ml-1">새 비밀번호</label>
                     <input 
                       type="text" 
                       value={newPassword}
                       onChange={(e) => setNewPassword(e.target.value)}
                       className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-orange-200 outline-none font-bold text-lg"
                       placeholder="변경할 비밀번호 입력"
                     />
                   </div>
                   <button 
                     onClick={handleUpdatePassword}
                     className="w-full py-4 bg-[#555843] text-white rounded-2xl font-black text-lg shadow-lg shadow-gray-200 hover:opacity-90 transition-all"
                   >
                     비밀번호 즉시 변경
                   </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
