const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const REPORTS_DIR = path.join(__dirname, '..', 'public', 'reports');
const INDEX_PATH = path.join(__dirname, '..', 'public', 'index.html');
const CATEGORIES = {
  plan: { label: '기획서', dir: 'plan' },
  architecture: { label: '아키텍처', dir: 'architecture' },
  mockup: { label: '목업', dir: 'mockup' },
  research: { label: '리서치', dir: 'research' },
  marketing: { label: '마케팅', dir: 'marketing' },
  review: { label: '코드 리뷰', dir: 'review', aliases: ['reviews'] },
  release: { label: '결과 보고', dir: 'release' },
  task: { label: '태스크', dir: 'task' },
  qa: { label: 'QA', dir: 'qa' },
  security: { label: '보안', dir: 'security' },
  ops: { label: '운영', dir: 'ops' },
  analysis: { label: '분석', dir: 'analysis' },
  archive: { label: '아카이브', dir: 'archive/architecture', aliases: ['archive/release', 'archive/review', 'archive/task'] },
};

function mdToHtml(mdContent, title, date) {
  const body = marked.parse(mdContent);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="date" content="${date}">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8f9fa;color:#333;line-height:1.7}
.container{max-width:860px;margin:0 auto;padding:32px 24px}
.back{display:inline-block;margin-bottom:20px;color:#666;text-decoration:none;font-size:14px}
.back:hover{color:#333}
h1{font-size:24px;font-weight:700;margin-bottom:16px;color:#1a1a2e;border-bottom:2px solid #e94560;padding-bottom:12px}
h2{font-size:20px;font-weight:600;margin:28px 0 12px;color:#16213e}
h3{font-size:16px;font-weight:600;margin:20px 0 8px;color:#333}
p{margin-bottom:12px}
ul,ol{margin:8px 0 16px 24px}
li{margin-bottom:6px}
code{background:#e9ecef;padding:2px 6px;border-radius:3px;font-size:13px}
pre{background:#1a1a2e;color:#e2e2e2;padding:16px;border-radius:8px;overflow-x:auto;margin:12px 0}
pre code{background:none;padding:0;color:inherit}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #dee2e6;padding:8px 12px;text-align:left;font-size:14px}
th{background:#f1f3f5;font-weight:600}
blockquote{border-left:4px solid #e94560;padding:8px 16px;margin:12px 0;background:#fff5f5;color:#555}
.meta{font-size:13px;color:#888;margin-bottom:24px}
</style>
</head>
<body>
<div class="container">
<a class="back" href="/">&larr; 목록으로</a>
<div class="meta">${date}</div>
${body}
</div>
</body>
</html>`;
}

function convertMdFiles() {
  let converted = 0;
  for (const [category, info] of Object.entries(CATEGORIES)) {
    const dirs = [info.dir, ...(info.aliases || [])];
    for (const dirName of dirs) {
      const dir = path.join(REPORTS_DIR, dirName);
      if (!fs.existsSync(dir)) continue;
      const mdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of mdFiles) {
        const mdPath = path.join(dir, file);
        const mdContent = fs.readFileSync(mdPath, 'utf-8');
        const titleMatch = mdContent.match(/^#\s+(.+)/m);
        const title = titleMatch ? titleMatch[1] : path.basename(file, '.md');
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : 'N/A';
        const htmlFilename = file.replace(/\.md$/, '.html');
        // Save to main category dir (not alias)
        const targetDir = path.join(REPORTS_DIR, info.dir);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const htmlPath = path.join(targetDir, htmlFilename);
        if (!fs.existsSync(htmlPath)) {
          fs.writeFileSync(htmlPath, mdToHtml(mdContent, title, date), 'utf-8');
          converted++;
          console.log('  [md→html] ' + dirName + '/' + file + ' → ' + info.dir + '/' + htmlFilename);
        }
      }
    }
  }
  return converted;
}

function extractMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  const dateMatch = content.match(/<meta\s+name="date"\s+content="([^"]+)"/i);
  const projectMatch = content.match(/<meta\s+name="project"\s+content="([^"]+)"/i);
  const filename = path.basename(filePath, '.html');
  const fileDate = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return {
    title: titleMatch ? titleMatch[1] : filename,
    date: dateMatch ? dateMatch[1] : (fileDate ? fileDate[1] : 'N/A'),
    project: projectMatch ? projectMatch[1] : '',
  };
}

// Convert .md → .html first
const convertedCount = convertMdFiles();
if (convertedCount > 0) console.log('Converted ' + convertedCount + ' markdown files\n');

const reports = [];
for (const [category, info] of Object.entries(CATEGORIES)) {
  // Scan main dir + aliases
  const dirs = [info.dir, ...(info.aliases || [])];
  for (const dirName of dirs) {
    const dir = path.join(REPORTS_DIR, dirName);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort().reverse();
    for (const file of files) {
      const meta = extractMeta(path.join(dir, file));
      // Dedupe: don't add if same title+date already exists
      const exists = reports.some(r => r.title === meta.title && r.date === meta.date && r.category === category);
      if (!exists) {
        reports.push({ ...meta, category, categoryLabel: info.label, path: 'reports/' + dirName + '/' + file });
      }
    }
  }
}
reports.sort((a, b) => b.date.localeCompare(a.date));

// Assign sequential numbers (newest = highest)
reports.forEach((r, i) => { r.num = reports.length - i; });

// 카테고리별 탭 동적 생성
const categoryCounts = {};
for (const [key, info] of Object.entries(CATEGORIES)) {
  categoryCounts[key] = reports.filter(r => r.category === key).length;
}

const reportsJson = JSON.stringify(reports);

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Mozzi Reports</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f5;color:#333}
.header{background:#1a1a2e;color:#fff;padding:24px 32px}
.header h1{font-size:24px;font-weight:700}
.header p{font-size:14px;color:#8b8ba7;margin-top:4px}
.tabs{display:flex;background:#16213e;padding:0 32px;flex-wrap:wrap}
.tab{padding:12px 24px;color:#8b8ba7;cursor:pointer;font-size:14px;font-weight:500;border-bottom:3px solid transparent;transition:all .2s}
.tab:hover{color:#e2e2e2}
.tab.active{color:#fff;border-bottom-color:#e94560}
.content{max-width:960px;margin:24px auto;padding:0 16px}
.date-group{margin-bottom:24px}
.date-header{font-size:13px;font-weight:600;color:#666;padding:8px 4px;border-bottom:2px solid #ddd;margin-bottom:8px}
.card{background:#fff;border-radius:8px;padding:14px 20px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);display:flex;align-items:center;transition:box-shadow .2s;gap:12px}
.card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.12)}
.card-num{font-size:12px;font-weight:700;color:#aaa;min-width:32px;text-align:center}
.card-info{flex:1;min-width:0}
.card-info h3{font-size:14px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-info .meta{font-size:11px;color:#888}
.card-info .meta span{margin-right:10px}
.badge{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap}
.badge.review{background:#fff3cd;color:#856404}
.badge.release{background:#d4edda;color:#155724}
.badge.architecture{background:#cce5ff;color:#004085}
.badge.task{background:#e0f2fe;color:#0369a1}
.badge.marketing{background:#f3e8ff;color:#6b21a8}
.badge.mockup{background:#fce7f3;color:#be185d}
.badge.plan{background:#fef2f2;color:#dc2626}
.badge.research{background:#ecfdf5;color:#065f46}
.badge.qa{background:#ede9fe;color:#5b21b6}
.badge.security{background:#fef3c7;color:#92400e}
.badge.ops{background:#e0e7ff;color:#3730a3}
.badge.analysis{background:#f0fdf4;color:#166534}
.badge.archive{background:#f3f4f6;color:#6b7280}
.empty{text-align:center;color:#999;padding:40px}
a{text-decoration:none;color:inherit}
</style>
</head>
<body>
<div class="header"><h1>Mozzi Reports</h1><p>태스크 · 코드 리뷰 · 결과 보고 · 아키텍처 · 마케팅</p></div>
<div class="tabs">
<div class="tab active" data-tab="all">전체 ${reports.length}</div>
${Object.entries(CATEGORIES).filter(([k]) => categoryCounts[k] > 0).map(([key, info]) => `<div class="tab" data-tab="${key}">${info.label} ${categoryCounts[key]}</div>`).join('\n')}
<a href="cron-dashboard.html" class="tab" style="text-decoration:none;color:inherit;margin-left:auto">크론 대시보드</a>
</div>
<div class="content" id="report-list"></div>
<script>
var reports=${reportsJson};
function render(f){
  var l=document.getElementById("report-list");
  var d=f==="all"?reports:reports.filter(function(r){return r.category===f});
  if(!d.length){l.innerHTML="<div class=\\"empty\\">보고서가 없습니다</div>";return}
  var groups={};
  d.forEach(function(r){
    if(!groups[r.date])groups[r.date]=[];
    groups[r.date].push(r);
  });
  var dates=Object.keys(groups).sort().reverse();
  var html=dates.map(function(date){
    var items=groups[date];
    var cards=items.map(function(r){
      return '<a href="'+r.path+'" target="_blank"><div class="card"><span class="card-num">#'+r.num+'</span><div class="card-info"><h3>'+r.title+'</h3><div class="meta"><span>'+(r.project||"")+'</span></div></div><span class="badge '+r.category+'">'+r.categoryLabel+'</span></div></a>';
    }).join("");
    return '<div class="date-group"><div class="date-header">'+date+' ('+items.length+')</div>'+cards+'</div>';
  }).join("");
  l.innerHTML=html;
}
document.querySelectorAll(".tab").forEach(function(t){
  t.addEventListener("click",function(){
    document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active")});
    t.classList.add("active");
    render(t.dataset.tab);
  });
});
render("all");
</script>
</body>
</html>`;

fs.writeFileSync(INDEX_PATH, html, 'utf-8');
console.log('Built: ' + reports.length + ' reports');
reports.forEach(function(r) { console.log('  [' + r.category + '] #' + r.num + ' ' + r.date + ' ' + r.title); });
