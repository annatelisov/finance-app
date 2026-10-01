(function(){
  "use strict";

  /* ---------- Firebase ---------- */
  var firebaseConfig = {
    apiKey: "AIzaSyCE_k96rbf-aSJS0_SFdj350oThe9eB5Xc",
    authDomain: "finance-app-751d3.firebaseapp.com",
    projectId: "finance-app-751d3",
    storageBucket: "finance-app-751d3.firebasestorage.app",
    messagingSenderId: "947677403414",
    appId: "1:947677403414:web:47eac559cda91d313bd837",
    measurementId: "G-C97EXT6YMB"
  };
  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var currentUser = null;
  var householdId = null;
  var householdUnsub = null;

  function generateInviteCode(){
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoids ambiguous chars (0/O, 1/I)
    var code = "";
    for(var i=0;i<6;i++){ code += chars.charAt(Math.floor(Math.random()*chars.length)); }
    return code;
  }

  function friendlyAuthError(err){
    var code = err && err.code;
    var map = {
      "auth/invalid-email":"כתובת אימייל לא תקינה",
      "auth/user-not-found":"לא נמצא משתמש עם אימייל זה",
      "auth/wrong-password":"סיסמה שגויה",
      "auth/email-already-in-use":"כבר קיים חשבון עם אימייל זה",
      "auth/weak-password":"הסיסמה חייבת להכיל לפחות 6 תווים",
      "auth/invalid-credential":"אימייל או סיסמה שגויים",
      "auth/missing-password":"נא להזין סיסמה",
      "auth/too-many-requests":"יותר מדי נסיונות. נסי שוב מאוחר יותר"
    };
    return map[code] || "משהו השתבש. נסי שוב.";
  }

  function attachHousehold(hid){
    householdId = hid;
    if(householdUnsub){ householdUnsub(); householdUnsub = null; }
    householdUnsub = db.collection("households").doc(hid).onSnapshot(function(snap){
      if(!snap.exists) return;
      var hdata = snap.data();
      data = normalizeData(hdata.data || {});
      renderHouseholdInfo(hdata);
      document.getElementById("loadingScreen").style.display = "none";
      document.getElementById("onboardScreen").style.display = "none";
      document.getElementById("authScreen").style.display = "none";
      document.getElementById("mainApp").style.display = "flex";
      renderAll();
    }, function(){
      showToast("שגיאה בסנכרון הנתונים");
    });
  }

  function renderHouseholdInfo(hdata){
    var emailEl = document.getElementById("settingsEmail");
    if(emailEl) emailEl.textContent = currentUser ? currentUser.email : "";
    var codeEl = document.getElementById("settingsInviteCode");
    if(codeEl) codeEl.textContent = hdata.inviteCode || "";
    var membersEl = document.getElementById("settingsMembers");
    if(membersEl){
      var emails = hdata.memberEmails || [];
      membersEl.innerHTML = emails.map(function(em){
        var mine = currentUser && em === currentUser.email;
        return '<div class="row" style="padding:7px 2px;"><span class="name">'+escapeHtml(em)+(mine?' (את)':'')+'</span></div>';
      }).join("") || '<div class="hint">אין נתונים</div>';
    }
  }

  function resolveHousehold(user){
    db.collection("users").doc(user.uid).get().then(function(snap){
      var udata = snap.exists ? snap.data() : null;
      if(udata && udata.householdId){
        attachHousehold(udata.householdId);
      } else {
        db.collection("users").doc(user.uid).set({ email:user.email }, {merge:true});
        document.getElementById("loadingScreen").style.display = "none";
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("onboardScreen").style.display = "flex";
      }
    }).catch(function(){
      showToast("שגיאה בטעינת הנתונים");
      document.getElementById("loadingScreen").style.display = "none";
    });
  }

  function createHousehold(){
    var user = currentUser;
    if(!user) return;
    var code = generateInviteCode();
    var hRef = db.collection("households").doc();
    var payload = {
      members: [user.uid],
      memberEmails: [user.email],
      inviteCode: code,
      data: defaultData(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    hRef.set(payload).then(function(){
      return db.collection("inviteCodes").doc(code).set({ householdId: hRef.id });
    }).then(function(){
      return db.collection("users").doc(user.uid).set({ email:user.email, householdId: hRef.id }, {merge:true});
    }).then(function(){
      attachHousehold(hRef.id);
    }).catch(function(){
      showOnboardError("שגיאה ביצירת משק הבית. נסי שוב.");
    });
  }

  function joinHousehold(codeRaw){
    var user = currentUser;
    var code = (codeRaw||"").trim().toUpperCase();
    if(!code){ showOnboardError("נא להזין קוד הזמנה"); return; }
    db.collection("inviteCodes").doc(code).get().then(function(snap){
      if(!snap.exists){ showOnboardError("קוד ההזמנה לא נמצא"); return; }
      var hid = snap.data().householdId;
      var hRef = db.collection("households").doc(hid);
      return hRef.update({
        members: firebase.firestore.FieldValue.arrayUnion(user.uid),
        memberEmails: firebase.firestore.FieldValue.arrayUnion(user.email)
      }).then(function(){
        return db.collection("users").doc(user.uid).set({ email:user.email, householdId:hid }, {merge:true});
      }).then(function(){
        attachHousehold(hid);
      });
    }).catch(function(){
      showOnboardError("שגיאה בהצטרפות. בדקי את הקוד ונסי שוב.");
    });
  }

  function showOnboardError(msg){
    var el = document.getElementById("ob-error");
    el.textContent = msg; el.style.display = "block";
  }
  function showAuthError(msg){
    var el = document.getElementById("auth-error");
    el.textContent = msg; el.style.display = "block";
  }

  auth.onAuthStateChanged(function(user){
    if(user){
      currentUser = user;
      document.getElementById("authScreen").style.display = "none";
      document.getElementById("loadingScreen").style.display = "flex";
      resolveHousehold(user);
    } else {
      currentUser = null;
      householdId = null;
      if(householdUnsub){ householdUnsub(); householdUnsub = null; }
      document.getElementById("mainApp").style.display = "none";
      document.getElementById("onboardScreen").style.display = "none";
      document.getElementById("loadingScreen").style.display = "none";
      document.getElementById("authScreen").style.display = "flex";
    }
  });

  /* ---------- Auth / onboarding screen wiring ---------- */
  var authMode = "signin";
  document.querySelectorAll(".auth-tab").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll(".auth-tab").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      authMode = btn.dataset.mode;
      document.getElementById("auth-submit").textContent = authMode === "signin" ? "התחברות" : "הרשמה";
      document.getElementById("auth-error").style.display = "none";
    });
  });
  document.getElementById("auth-submit").addEventListener("click", function(){
    var email = document.getElementById("auth-email").value.trim();
    var pass = document.getElementById("auth-password").value;
    document.getElementById("auth-error").style.display = "none";
    if(!email || !pass){ showAuthError("נא למלא אימייל וסיסמה"); return; }
    var action = authMode==="signin"
      ? auth.signInWithEmailAndPassword(email, pass)
      : auth.createUserWithEmailAndPassword(email, pass);
    action.catch(function(err){ showAuthError(friendlyAuthError(err)); });
  });
  document.getElementById("auth-reset").addEventListener("click", function(){
    var email = document.getElementById("auth-email").value.trim();
    if(!email){ showAuthError("הזיני קודם את כתובת האימייל שלך למעלה"); return; }
    auth.sendPasswordResetEmail(email).then(function(){
      showToast("נשלח מייל לאיפוס סיסמה");
    }).catch(function(err){ showAuthError(friendlyAuthError(err)); });
  });
  document.getElementById("ob-create").addEventListener("click", function(){
    document.getElementById("ob-error").style.display = "none";
    createHousehold();
  });
  document.getElementById("ob-join").addEventListener("click", function(){
    document.getElementById("ob-error").style.display = "none";
    joinHousehold(document.getElementById("ob-code").value);
  });
  document.getElementById("ob-signout").addEventListener("click", function(){ auth.signOut(); });
  document.getElementById("btnSignOut").addEventListener("click", function(){
    if(confirm("להתנתק?")){ auth.signOut(); }
  });
  document.getElementById("btnCopyCode").addEventListener("click", function(){
    var code = document.getElementById("settingsInviteCode").textContent;
    if(!code) return;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(code).then(function(){ showToast("הקוד הועתק"); }).catch(function(){ showToast(code); });
    } else { showToast(code); }
  });

  /* ---------- Data ---------- */
  var STORAGE_KEY = "homeBudgetData_v3";
  var DEFAULT_COLORS = ["#5FA98A","#6C93C9","#9481C4","#7C7FCB","#6FB09E","#8CA8D8","#B198D6","#7FA8C4",
    "#D98A94","#E8A3B8","#C1786F","#E38B6F","#E9A66B","#E3C063","#C9B458","#A6BF6A",
    "#7CBF8E","#5DB3B8","#5A9FD6","#4F78B5","#C58FD0","#A8839B","#B08968","#8A9AA8"];
  var ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

  function defaultData(){
    return {
      categories: [
        {id: uid(), name:"שכירות / משכנתא", color:"#5FA98A"},
        {id: uid(), name:"חשבונות בית", color:"#6C93C9"},
        {id: uid(), name:"מנויים", color:"#9481C4"},
        {id: uid(), name:"מכולת", color:"#6FB09E"},
        {id: uid(), name:"תחבורה", color:"#8CA8D8"},
        {id: uid(), name:"בילויים", color:"#B198D6"},
        {id: uid(), name:"אחר", color:"#7C7FCB"}
      ],
      fixedExpenses: [],
      variableExpenses: [],
      annualExpenses: [],
      incomes: []
    };
  }

  function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  function normalizeData(parsed){
    if(!parsed || typeof parsed !== "object") parsed = {};
    if(!parsed.categories || !parsed.categories.length) parsed.categories = defaultData().categories;
    if(!parsed.fixedExpenses) parsed.fixedExpenses = [];
    if(!parsed.variableExpenses) parsed.variableExpenses = [];
    if(!parsed.annualExpenses) parsed.annualExpenses = [];
    if(!parsed.incomes) parsed.incomes = [];
    parsed.fixedExpenses.forEach(function(e){ if(!e.months) e.months = ALL_MONTHS.slice(); });
    return parsed;
  }
  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){}
    if(!householdId) return;
    db.collection("households").doc(householdId).set(
      { data: data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(function(){ showToast("שמירה נכשלה — בדקי חיבור לאינטרנט"); });
  }

  var data = defaultData();

  /* ---------- State ---------- */
  // A budget month runs from day BUDGET_START_DAY of the month until the day before it next month
  // (e.g. September = 10.9 – 9.10), so dates before the 10th belong to the previous month.
  var BUDGET_START_DAY = 10;
  var today = new Date();
  var budgetNowYear = today.getFullYear();
  var budgetNowMonth = today.getMonth(); // 0-11
  if(today.getDate() < BUDGET_START_DAY){
    budgetNowMonth--;
    if(budgetNowMonth < 0){ budgetNowMonth = 11; budgetNowYear--; }
  }
  var viewYear = budgetNowYear;
  var viewMonth = budgetNowMonth; // 0-11, "this month" screen
  var historyYear = budgetNowYear;
  var historySelectedMonth = budgetNowMonth+1; // 1-12
  var annualYear = budgetNowYear;
  var currentScreen = "home";
  var currentSub = "fixed";
  var editingFixedId = null;
  var editingVariableId = null;
  var editingCatId = null;
  var editingAnnualId = null;
  var editingIncomeId = null;
  var monthCatFilter = "";
  var annualCatFilter = "";
  var historyCatFilter = "";

  var HE_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  var HE_MONTHS_SHORT = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];

  var fmt = new Intl.NumberFormat('he-IL', {maximumFractionDigits:0});
  function money(n){ return "₪" + fmt.format(Math.round(n||0)); }
  function monthKey(y,m){ return y + "-" + String(m+1).padStart(2,"0"); }
  // "YYYY-MM-DD" -> budget month key "YYYY-MM"
  function budgetKeyForDate(dateStr){
    var y = Number(dateStr.slice(0,4)), m = Number(dateStr.slice(5,7)) - 1, d = Number(dateStr.slice(8,10));
    if(d < BUDGET_START_DAY){ m--; if(m < 0){ m = 11; y--; } }
    return monthKey(y, m);
  }
  function inBudgetMonth(e, key){ return !!e.date && budgetKeyForDate(e.date) === key; }
  // e.g. "10.9 – 9.10"
  function budgetRangeLabel(m){
    return BUDGET_START_DAY + "." + (m+1) + " – " + (BUDGET_START_DAY-1) + "." + ((m+1)%12+1);
  }
  function escapeHtml(s){ var d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(msg){
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2000);
  }

  /* ---------- Category helpers ---------- */
  function getCat(id){ return data.categories.find(function(c){ return c.id === id; }); }
  function catOptionsHtml(selectedId){
    return data.categories.map(function(c){
      return '<option value="'+c.id+'"'+(c.id===selectedId?' selected':'')+'>'+escapeHtml(c.name)+'</option>';
    }).join("");
  }
  function populateCatFilterSelect(selectEl, currentValue){
    var options = '<option value="">כל הקטגוריות</option>' + data.categories.map(function(c){
      return '<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>';
    }).join("");
    selectEl.innerHTML = options;
    var stillValid = currentValue && data.categories.some(function(c){ return c.id===currentValue; });
    selectEl.value = stillValid ? currentValue : "";
    return stillValid ? currentValue : "";
  }

  /* ---------- Totals ---------- */
  // A fixed expense has started by month (y, m1) if it has no startMonth ("YYYY-MM") or that month is on/after it.
  function fixedStarted(e, y, m1){
    return !e.startMonth || monthKey(y, m1-1) >= e.startMonth;
  }
  function fixedAppliesTo(e, y, m1){
    return (e.months||ALL_MONTHS).indexOf(m1) !== -1 && fixedStarted(e, y, m1);
  }
  function fixedTotalForMonth1(y, m1){
    return data.fixedExpenses
      .filter(function(e){ return fixedAppliesTo(e, y, m1); })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
  }
  function annualContributionForMonth(y, m1){
    return data.annualExpenses.reduce(function(sum,e){
      var monthsOk = (e.months||[]).indexOf(m1) !== -1;
      var yearOk = e.everyYear !== false || (e.years||[]).indexOf(y) !== -1;
      if(monthsOk && yearOk){ sum += Number(e.amount||0); }
      return sum;
    }, 0);
  }
  function variableTotalForMonth(y,m){
    var key = monthKey(y,m);
    return data.variableExpenses
      .filter(function(e){ return inBudgetMonth(e, key); })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
  }
  function monthTotal(y,m){ return fixedTotalForMonth1(y, m+1) + annualContributionForMonth(y, m+1) + variableTotalForMonth(y,m); }
  function monthTotalForCategory(y, m, catId){
    var fixedTot = data.fixedExpenses
      .filter(function(e){ return e.categoryId===catId && fixedAppliesTo(e, y, m+1); })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
    var annualTot = data.annualExpenses
      .filter(function(e){
        var monthsOk = (e.months||[]).indexOf(m+1) !== -1;
        var yearOk = e.everyYear !== false || (e.years||[]).indexOf(y) !== -1;
        return e.categoryId===catId && monthsOk && yearOk;
      })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
    var key = monthKey(y,m);
    var varTot = data.variableExpenses
      .filter(function(e){ return e.categoryId===catId && inBudgetMonth(e, key); })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
    return fixedTot + annualTot + varTot;
  }
  function incomeTotalForMonth(y,m1){
    return data.incomes.filter(function(e){ return e.year===y && e.month===m1; })
      .reduce(function(sum,e){ return sum + Number(e.amount||0); }, 0);
  }

  /* ---------- Screen navigation ---------- */
  var SCREEN_TITLES = { home:"תקציב חודשי", month:"החודש הזה", history:"היסטוריה", annual:"ספירה שנתית", annualexp:"הוצאות שנתיות", settings:"הגדרות" };

  function goScreen(name){
    currentScreen = name;
    document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("active"); });
    document.getElementById("screen-"+name).classList.add("active");
    document.getElementById("hdrTitle").textContent = SCREEN_TITLES[name];
    document.getElementById("hdrBack").classList.toggle("show", name !== "home");
    document.getElementById("hdrGear").style.display = (name === "settings") ? "none" : "flex";
    renderAll();
  }

  document.querySelectorAll(".tile").forEach(function(t){
    t.addEventListener("click", function(){ goScreen(t.dataset.go); });
  });
  document.getElementById("hdrBack").addEventListener("click", function(){ goScreen("home"); });
  document.getElementById("hdrGear").addEventListener("click", function(){ goScreen("settings"); });

  /* ---------- Sub tabs ---------- */
  document.querySelectorAll("nav.subtabs button[data-sub]").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll("nav.subtabs button[data-sub]").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      currentSub = btn.dataset.sub;
      document.querySelectorAll("#screen-month .subview").forEach(function(v){ v.classList.remove("active"); });
      document.getElementById("sub-"+currentSub).classList.add("active");
      document.getElementById("monthFilterRow").style.display = (currentSub === "income") ? "none" : "flex";
    });
  });

  /* ---------- Settings tabs ---------- */
  document.querySelectorAll("nav.subtabs button[data-stab]").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll("nav.subtabs button[data-stab]").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll("#screen-settings .subview").forEach(function(v){ v.classList.remove("active"); });
      document.getElementById("stab-"+btn.dataset.stab).classList.add("active");
    });
  });

  /* ---------- Home tiles stats ---------- */
  function renderHomeStats(){
    var badge = document.getElementById("currentMonthBadge");
    badge.innerHTML = '<span class="bullet"></span>' + HE_MONTHS[budgetNowMonth] + ' ' + budgetNowYear;
    var remaining = incomeTotalForMonth(viewYear, viewMonth+1) - monthTotal(viewYear, viewMonth);
    var el = document.getElementById("tileMonthStat");
    el.textContent = "נשאר: " + money(remaining);
    el.style.color = remaining >= 0 ? "var(--teal)" : "var(--rose)";
    var yearTotal = 0;
    for(var m=0;m<12;m++){ yearTotal += monthTotal(annualYear, m); }
    document.getElementById("tileAnnualStat").textContent = money(yearTotal);
    var axCount = data.annualExpenses.length;
    document.getElementById("tileAnnualExpStat").textContent = axCount ? (axCount + " פריטים") : "";
  }

  /* ---------- This month screen ---------- */
  function renderMonthHeader(){
    document.getElementById("monthLabel").innerHTML = HE_MONTHS[viewMonth] + " " + viewYear +
      ' <span style="font-size:12px; font-weight:400; opacity:.7; white-space:nowrap;">(' + budgetRangeLabel(viewMonth) + ')</span>';
    var fixedTot = fixedTotalForMonth1(viewYear, viewMonth+1);
    var annualTot = annualContributionForMonth(viewYear, viewMonth+1);
    var varTot = variableTotalForMonth(viewYear, viewMonth);
    var expenseTot = fixedTot + varTot + annualTot;
    var incomeTot = incomeTotalForMonth(viewYear, viewMonth+1);
    var remaining = incomeTot - expenseTot;
    document.getElementById("fixedTotal").textContent = money(fixedTot);
    document.getElementById("variableTotal").textContent = money(varTot);
    document.getElementById("annualTotalInMonth").textContent = money(annualTot);
    document.getElementById("incomeTotal").textContent = money(incomeTot);
    document.getElementById("expenseTotal").textContent = money(expenseTot);
    var remEl = document.getElementById("remainingNum");
    remEl.textContent = money(remaining);
    remEl.classList.toggle("positive", remaining >= 0);
    remEl.classList.toggle("negative", remaining < 0);
  }

  var monthFilterWired = false;
  function renderMonthFilter(){
    var sel = document.getElementById("monthCatFilter");
    monthCatFilter = populateCatFilterSelect(sel, monthCatFilter);
    document.getElementById("monthFilterRow").style.display = (currentSub === "income") ? "none" : "flex";
    if(!monthFilterWired){
      monthFilterWired = true;
      sel.addEventListener("change", function(){
        monthCatFilter = sel.value;
        renderFixed(); renderVariable();
      });
    }
  }

  function monthsLabel(months){
    if(!months || months.length === 12) return "כל חודש";
    if(months.length === 0) return "ללא חודשים נבחרים";
    return months.slice().sort(function(a,b){return a-b;}).map(function(m){ return HE_MONTHS[m-1]; }).join(", ");
  }

  function renderFixed(){
    var list = document.getElementById("fixedList");
    var items = data.fixedExpenses.filter(function(e){ return fixedStarted(e, viewYear, viewMonth+1); });
    if(monthCatFilter){ items = items.filter(function(e){ return e.categoryId===monthCatFilter; }); }
    document.getElementById("fixedCount").textContent = items.length ? (items.length + " פריטים") : "";
    if(items.length === 0){
      var msg = monthCatFilter
        ? '<div class="empty"><span class="big">🔍</span>אין הוצאות קבועות בקטגוריה זו.</div>'
        : '<div class="empty"><span class="big">🗒️</span>עדיין אין הוצאות קבועות.<br>הוסיפי את הראשונה — שכר דירה, חשמל, אינטרנט וכו׳.</div>';
      list.innerHTML = msg;
      return;
    }
    var byCat = {};
    items.forEach(function(e){
      var cid = e.categoryId || "none";
      if(!byCat[cid]) byCat[cid] = [];
      byCat[cid].push(e);
    });
    var html = "";
    Object.keys(byCat).forEach(function(cid){
      var cat = getCat(cid);
      var rows = byCat[cid];
      var subtotal = rows.reduce(function(s,e){ return s + Number(e.amount||0); }, 0);
      html += '<div class="cat-group">';
      html += '<div class="cat-group-head"><span class="swatch" style="background:'+(cat?cat.color:'#999')+'"></span>';
      html += '<span class="name">'+(cat?escapeHtml(cat.name):'ללא קטגוריה')+'</span>';
      html += '<span class="subtotal">'+money(subtotal)+'</span></div>';
      rows.forEach(function(e){
        html += '<div class="row">';
        html += '<span class="name">'+escapeHtml(e.name)+'<span class="tag">'+monthsLabel(e.months)+(e.startMonth ? ' · החל מ'+startMonthLabel(e.startMonth) : '')+'</span></span>';
        html += '<span class="amount">'+money(e.amount)+'</span>';
        html += '<span class="actions">';
        html += '<button data-act="edit-fixed" data-id="'+e.id+'" aria-label="עריכה">✎</button>';
        html += '<button data-act="del-fixed" data-id="'+e.id+'" aria-label="מחיקה">🗑</button>';
        html += '</span></div>';
      });
      html += '</div>';
    });
    list.innerHTML = html;
  }

  function monthsGridHtml(selectedMonths){
    var sel = selectedMonths || ALL_MONTHS.slice();
    var html = '<div class="months-quick">'+
      '<button type="button" id="mg-all">כל חודש</button>'+
      '<button type="button" id="mg-none">נקה בחירה</button></div>'+
      '<div class="months-grid">';
    for(var i=1;i<=12;i++){
      var checked = sel.indexOf(i) !== -1;
      html += '<label><input type="checkbox" class="mg-cb" value="'+i+'"'+(checked?' checked':'')+'><span>'+HE_MONTHS[i-1]+'</span></label>';
    }
    html += '</div>';
    return html;
  }

  function startMonthLabel(key){
    return HE_MONTHS[Number(key.slice(5,7))-1] + " " + key.slice(0,4);
  }
  // Options from two years before the viewed year through the next year, plus "from the start".
  function startMonthOptionsHtml(selected){
    var keys = [];
    for(var y=viewYear-2; y<=viewYear+1; y++){
      for(var m=0; m<12; m++){ keys.push(monthKey(y,m)); }
    }
    if(selected && keys.indexOf(selected) === -1){ keys.push(selected); keys.sort(); }
    return '<option value=""'+(selected?'':' selected')+'>מההתחלה (כל התקופה)</option>' +
      keys.map(function(k){
        return '<option value="'+k+'"'+(k===selected?' selected':'')+'>'+startMonthLabel(k)+'</option>';
      }).join("");
  }

  function fixedFormHtml(existing){
    var isEdit = !!existing;
    var startSel = isEdit ? (existing.startMonth || "") : monthKey(viewYear, viewMonth);
    return '<h3>'+(isEdit? 'עריכת הוצאה קבועה' : 'הוצאה קבועה חדשה')+'</h3>'+
      '<div class="field"><label>שם ההוצאה</label><input type="text" id="fx-name" placeholder="לדוגמה: שכר דירה" value="'+(isEdit?escapeHtml(existing.name):'')+'"></div>'+
      '<div class="field"><label>קטגוריה</label><select id="fx-cat">'+catOptionsHtml(isEdit?existing.categoryId:data.categories[0] && data.categories[0].id)+'</select></div>'+
      '<div class="field"><label>סכום לחודש (₪)</label><input type="number" inputmode="decimal" id="fx-amount" placeholder="0" value="'+(isEdit?existing.amount:'')+'"></div>'+
      '<div class="field"><label>באילו חודשים זה חוזר</label>'+monthsGridHtml(isEdit?existing.months:null)+'</div>'+
      '<div class="field"><label>החל מחודש</label><select id="fx-start">'+startMonthOptionsHtml(startSel)+'</select></div>'+
      '<div class="form-actions">'+
        (isEdit? '<button class="btn-danger" id="fx-delete" type="button">מחיקה</button>' : '')+
        '<button class="btn-cancel" id="fx-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="fx-save" type="button">שמירה</button>'+
      '</div>';
  }

  function wireMonthsGrid(card){
    card.querySelector("#mg-all").addEventListener("click", function(){
      card.querySelectorAll(".mg-cb").forEach(function(cb){ cb.checked = true; });
    });
    card.querySelector("#mg-none").addEventListener("click", function(){
      card.querySelectorAll(".mg-cb").forEach(function(cb){ cb.checked = false; });
    });
  }
  function readMonthsGrid(card){
    return Array.prototype.slice.call(card.querySelectorAll(".mg-cb"))
      .filter(function(cb){ return cb.checked; })
      .map(function(cb){ return Number(cb.value); });
  }

  function openFixedForm(existing){
    if(!existing) unanchorForm("formFixed");
    editingFixedId = existing ? existing.id : null;
    var card = document.getElementById("formFixed");
    card.innerHTML = fixedFormHtml(existing);
    card.style.display = "block";
    document.getElementById("btnAddFixed").style.display = "none";
    wireMonthsGrid(card);
    document.getElementById("fx-save").addEventListener("click", function(){
      var name = document.getElementById("fx-name").value.trim();
      var cat = document.getElementById("fx-cat").value;
      var amount = parseFloat(document.getElementById("fx-amount").value);
      var months = readMonthsGrid(card);
      var startMonth = document.getElementById("fx-start").value;
      if(!name){ showToast("נא להזין שם"); return; }
      if(isNaN(amount) || amount < 0){ showToast("נא להזין סכום תקין"); return; }
      if(months.length === 0){ showToast("נא לבחור לפחות חודש אחד"); return; }
      if(editingFixedId){
        var e = data.fixedExpenses.find(function(x){ return x.id===editingFixedId; });
        e.name=name; e.categoryId=cat; e.amount=amount; e.months=months;
        if(startMonth) e.startMonth = startMonth; else delete e.startMonth;
      } else {
        var item = {id:uid(), name:name, categoryId:cat, amount:amount, months:months};
        if(startMonth) item.startMonth = startMonth;
        data.fixedExpenses.push(item);
      }
      save(); closeFixedForm(); renderAll();
      showToast("נשמר");
    });
    document.getElementById("fx-cancel").addEventListener("click", closeFixedForm);
    var del = document.getElementById("fx-delete");
    if(del) del.addEventListener("click", function(){
      data.fixedExpenses = data.fixedExpenses.filter(function(x){ return x.id!==editingFixedId; });
      save(); closeFixedForm(); renderAll();
      showToast("נמחק");
    });
  }
  function closeFixedForm(){
    unanchorForm("formFixed");
    document.getElementById("formFixed").style.display = "none";
    document.getElementById("btnAddFixed").style.display = "block";
    editingFixedId = null;
  }

  /* ---------- Variable ---------- */
  function renderVariable(){
    var list = document.getElementById("variableList");
    var key = monthKey(viewYear, viewMonth);
    var items = data.variableExpenses
      .filter(function(e){ return inBudgetMonth(e, key); })
      .filter(function(e){ return !monthCatFilter || e.categoryId===monthCatFilter; })
      .sort(function(a,b){ return b.date.localeCompare(a.date); });
    document.getElementById("variableCount").textContent = items.length ? (items.length + " פריטים") : "";
    if(items.length === 0){
      var msg = monthCatFilter
        ? '<div class="empty"><span class="big">🔍</span>אין הוצאות משתנות בקטגוריה זו לחודש '+HE_MONTHS[viewMonth]+'.</div>'
        : '<div class="empty"><span class="big">🧺</span>אין עדיין הוצאות משתנות לחודש '+HE_MONTHS[viewMonth]+'.<br>הוסיפי קניה, דלק, יציאה וכו׳.</div>';
      list.innerHTML = msg;
      return;
    }
    var html = "";
    items.forEach(function(e){
      var cat = getCat(e.categoryId);
      html += '<div class="row">';
      html += '<span class="date">'+e.date.slice(8,10)+'/'+e.date.slice(5,7)+'</span>';
      html += '<span class="name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(cat?cat.color:'#999')+';margin-inline-end:6px;"></span>'+escapeHtml(e.name || (cat?cat.name:'הוצאה'))+(e.note?'<span class="note">'+escapeHtml(e.note)+'</span>':'')+'</span>';
      html += '<span class="amount">'+money(e.amount)+'</span>';
      html += '<span class="actions">';
      html += '<button data-act="edit-variable" data-id="'+e.id+'" aria-label="עריכה">✎</button>';
      html += '<button data-act="del-variable" data-id="'+e.id+'" aria-label="מחיקה">🗑</button>';
      html += '</span></div>';
    });
    list.innerHTML = html;
  }

  function variableFormHtml(existing){
    var isEdit = !!existing;
    // New expense: today if viewing the current budget month, otherwise the month's first day (the 10th)
    var isCurrentBudgetMonth = viewYear === budgetNowYear && viewMonth === budgetNowMonth;
    var defaultDate = isEdit ? existing.date : (isCurrentBudgetMonth
      ? today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0")
      : monthKey(viewYear, viewMonth)+"-"+String(BUDGET_START_DAY).padStart(2,"0"));
    return '<h3>'+(isEdit? 'עריכת הוצאה' : 'הוצאה משתנה חדשה')+'</h3>'+
      '<div class="field"><label>תיאור</label><input type="text" id="vx-name" placeholder="לדוגמה: סופר, דלק..." value="'+(isEdit?escapeHtml(existing.name||''):'')+'"></div>'+
      '<div class="field"><label>קטגוריה</label><select id="vx-cat">'+catOptionsHtml(isEdit?existing.categoryId:data.categories[0] && data.categories[0].id)+'</select></div>'+
      '<div class="field"><label>סכום (₪)</label><input type="number" inputmode="decimal" id="vx-amount" placeholder="0" value="'+(isEdit?existing.amount:'')+'"></div>'+
      '<div class="field"><label>תאריך</label><input type="date" id="vx-date" value="'+defaultDate+'"></div>'+
      '<div class="field"><label>הערה (לא חובה)</label><input type="text" id="vx-note" placeholder="פרטים נוספים" value="'+(isEdit?escapeHtml(existing.note||''):'')+'"></div>'+
      '<div class="form-actions">'+
        (isEdit? '<button class="btn-danger" id="vx-delete" type="button">מחיקה</button>' : '')+
        '<button class="btn-cancel" id="vx-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="vx-save" type="button">שמירה</button>'+
      '</div>';
  }

  function openVariableForm(existing){
    if(!existing) unanchorForm("formVariable");
    editingVariableId = existing ? existing.id : null;
    var card = document.getElementById("formVariable");
    card.innerHTML = variableFormHtml(existing);
    card.style.display = "block";
    document.getElementById("btnAddVariable").style.display = "none";
    document.getElementById("vx-save").addEventListener("click", function(){
      var name = document.getElementById("vx-name").value.trim();
      var cat = document.getElementById("vx-cat").value;
      var amount = parseFloat(document.getElementById("vx-amount").value);
      var date = document.getElementById("vx-date").value;
      var note = document.getElementById("vx-note").value.trim();
      if(isNaN(amount) || amount < 0){ showToast("נא להזין סכום תקין"); return; }
      if(!date){ showToast("נא לבחור תאריך"); return; }
      if(editingVariableId){
        var e = data.variableExpenses.find(function(x){ return x.id===editingVariableId; });
        e.name=name; e.categoryId=cat; e.amount=amount; e.date=date; e.note=note;
      } else {
        data.variableExpenses.push({id:uid(), name:name, categoryId:cat, amount:amount, date:date, note:note});
      }
      save(); closeVariableForm(); renderAll();
      showToast("נשמר");
    });
    document.getElementById("vx-cancel").addEventListener("click", closeVariableForm);
    var del = document.getElementById("vx-delete");
    if(del) del.addEventListener("click", function(){
      data.variableExpenses = data.variableExpenses.filter(function(x){ return x.id!==editingVariableId; });
      save(); closeVariableForm(); renderAll();
      showToast("נמחק");
    });
  }
  function closeVariableForm(){
    unanchorForm("formVariable");
    document.getElementById("formVariable").style.display = "none";
    document.getElementById("btnAddVariable").style.display = "block";
    editingVariableId = null;
  }

  /* ---------- CSV Import (variable expenses) ---------- */
  function detectDelimiter(text){
    var firstLine = text.split(/\r?\n/)[0] || "";
    var commas = (firstLine.match(/,/g)||[]).length;
    var semis = (firstLine.match(/;/g)||[]).length;
    return semis > commas ? ";" : ",";
  }
  function parseCSV(text, delim){
    var rows = [], row = [], field = "", inQuotes = false;
    for(var i=0;i<text.length;i++){
      var c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; } else { inQuotes = false; }
        } else { field += c; }
      } else {
        if(c === '"'){ inQuotes = true; }
        else if(c === delim){ row.push(field); field = ""; }
        else if(c === "\n"){ row.push(field); rows.push(row); row = []; field = ""; }
        else if(c === "\r"){ /* skip */ }
        else { field += c; }
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows.filter(function(r){ return r.length>1 || (r.length===1 && r[0].trim()!==""); });
  }
  function guessColumn(headers, keywords){
    for(var i=0;i<headers.length;i++){
      var h = (headers[i]||"").toString().trim().toLowerCase();
      for(var k=0;k<keywords.length;k++){
        if(h.indexOf(keywords[k]) !== -1) return i;
      }
    }
    return -1;
  }
  function parseDateFlexible(str){
    if(!str) return null;
    str = String(str).trim();
    var m = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if(m){ return m[1]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0"); }
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if(m){
      var d=m[1], mo=m[2], y=m[3];
      if(y.length===2) y = (Number(y)<50 ? "20":"19") + y;
      return y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    }
    var parsed = Date.parse(str);
    if(!isNaN(parsed)){
      var dd = new Date(parsed);
      return dd.getFullYear()+"-"+String(dd.getMonth()+1).padStart(2,"0")+"-"+String(dd.getDate()).padStart(2,"0");
    }
    return null;
  }
  function parseAmountFlexible(str){
    if(str===undefined || str===null || str==="") return NaN;
    var s = String(str).trim().replace(/[₪$€,\s]/g,"");
    var isParen = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g,"");
    var n = parseFloat(s);
    if(isNaN(n)) return NaN;
    return Math.abs(n);
  }

  var csvRows = null; // full parsed rows including header
  function buildMappedRows(colDate, colDesc, colAmount){
    var out = [];
    for(var i=1;i<csvRows.length;i++){
      var r = csvRows[i];
      var dateRaw = r[colDate];
      var descRaw = r[colDesc];
      var amountRaw = r[colAmount];
      var date = parseDateFlexible(dateRaw);
      var amount = parseAmountFlexible(amountRaw);
      var valid = !!date && !isNaN(amount) && amount > 0;
      out.push({ date:date, name:(descRaw||"").toString().trim(), amount:amount, valid:valid });
    }
    return out;
  }
  function importDupKey(date, name, amount){
    return date + "|" + (name || "יובא מקובץ").trim() + "|" + Math.round(Number(amount)*100);
  }
  // Marks rows that already exist as variable expenses (same date, description and amount).
  // Uses counts, so a file with two identical rows and one saved copy imports just the second.
  function markImportDuplicates(rows){
    var existing = {};
    data.variableExpenses.forEach(function(e){
      var k = importDupKey(e.date, e.name, e.amount);
      existing[k] = (existing[k]||0) + 1;
    });
    rows.forEach(function(m){
      var k = importDupKey(m.date, m.name, m.amount);
      if(existing[k]){ m.dup = true; existing[k]--; }
    });
  }
  function renderImportPreview(){
    var colDate = Number(document.getElementById("imp-col-date").value);
    var colDesc = Number(document.getElementById("imp-col-desc").value);
    var colAmount = Number(document.getElementById("imp-col-amount").value);
    var mapped = buildMappedRows(colDate, colDesc, colAmount);
    var validRows = mapped.filter(function(m){ return m.valid; });
    var skipped = mapped.length - validRows.length;
    markImportDuplicates(validRows);
    var dups = validRows.filter(function(m){ return m.dup; }).length;
    validRows = validRows.filter(function(m){ return !m.dup; });
    document.getElementById("imp-preview-count").textContent =
      validRows.length + " עסקאות מוכנות לייבוא" +
      (dups ? " · " + dups + " כבר קיימות ויידלגו" : "") +
      (skipped ? " · " + skipped + " שורות לא זוהו ויידלגו" : "");
    var box = document.getElementById("imp-preview-list");
    var html = "";
    validRows.slice(0,8).forEach(function(m){
      html += '<div class="row"><span class="date">'+m.date.slice(8,10)+'/'+m.date.slice(5,7)+'</span>'+
        '<span class="name">'+escapeHtml(m.name||"(ללא תיאור)")+'</span>'+
        '<span class="amount">'+money(m.amount)+'</span></div>';
    });
    if(validRows.length > 8){
      html += '<div class="hint" style="padding:8px 2px;">ועוד '+(validRows.length-8)+' שורות…</div>';
    }
    box.innerHTML = html || '<div class="empty" style="padding:16px 4px;">לא נמצאו שורות תקינות לייבוא.</div>';
    return validRows;
  }

  function openImportCard(headers){
    var card = document.getElementById("importCard");
    var guessDate = guessColumn(headers, ["תאריך","date"]);
    var guessDesc = guessColumn(headers, ["תיאור","שם בית עסק","בית עסק","עסק","description","details","merchant"]);
    var guessAmount = guessColumn(headers, ["סכום","חיוב","total","amount","sum"]);
    if(guessDate===-1) guessDate = 0;
    if(guessDesc===-1) guessDesc = Math.min(1, headers.length-1);
    if(guessAmount===-1) guessAmount = headers.length-1;

    function colOptions(selected){
      return headers.map(function(h,i){
        return '<option value="'+i+'"'+(i===selected?' selected':'')+'>'+escapeHtml(h||("עמודה "+(i+1)))+'</option>';
      }).join("");
    }

    card.innerHTML =
      '<h3>ייבוא הוצאות מקובץ CSV</h3>'+
      '<p class="hint" style="margin-bottom:10px;">נמצאו '+(csvRows.length-1)+' שורות. בדקו שהעמודות נכונות:</p>'+
      '<div class="field"><label>עמודת תאריך</label><select id="imp-col-date">'+colOptions(guessDate)+'</select></div>'+
      '<div class="field"><label>עמודת תיאור</label><select id="imp-col-desc">'+colOptions(guessDesc)+'</select></div>'+
      '<div class="field"><label>עמודת סכום</label><select id="imp-col-amount">'+colOptions(guessAmount)+'</select></div>'+
      '<div class="field"><label>קטגוריה לכל הפריטים המיובאים</label><select id="imp-cat">'+catOptionsHtml(data.categories[0] && data.categories[0].id)+'</select></div>'+
      '<div class="hint" id="imp-preview-count"></div>'+
      '<div class="import-preview" id="imp-preview-list"></div>'+
      '<div class="form-actions">'+
        '<button class="btn-cancel" id="imp-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="imp-confirm" type="button">ייבוא</button>'+
      '</div>';
    card.style.display = "block";

    ["imp-col-date","imp-col-desc","imp-col-amount"].forEach(function(id){
      document.getElementById(id).addEventListener("change", renderImportPreview);
    });
    renderImportPreview();

    document.getElementById("imp-cancel").addEventListener("click", closeImportCard);
    document.getElementById("imp-confirm").addEventListener("click", function(){
      var validRows = renderImportPreview();
      if(validRows.length === 0){ showToast("אין עסקאות חדשות לייבוא"); return; }
      var catId = document.getElementById("imp-cat").value;
      validRows.forEach(function(r){
        data.variableExpenses.push({ id:uid(), name:r.name || "יובא מקובץ", categoryId:catId, amount:r.amount, date:r.date, note:"" });
      });
      save(); closeImportCard(); renderAll();
      showToast("יובאו " + validRows.length + " עסקאות");
    });
  }
  function closeImportCard(){
    document.getElementById("importCard").style.display = "none";
    document.getElementById("importCard").innerHTML = "";
    document.getElementById("csvFileInput").value = "";
    csvRows = null;
  }

  /* ---------- Income ---------- */
  function renderIncome(){
    var list = document.getElementById("incomeList");
    var m1 = viewMonth+1;
    var items = data.incomes.filter(function(e){ return e.year===viewYear && e.month===m1; });
    document.getElementById("incomeCount").textContent = items.length ? (items.length + " פריטים") : "";
    if(items.length === 0){
      list.innerHTML = '<div class="empty"><span class="big">💰</span>אין עדיין הכנסות לחודש '+HE_MONTHS[viewMonth]+'.<br>הוסיפי משכורת או הכנסה נוספת.</div>';
      return;
    }
    var html = "";
    items.forEach(function(e){
      html += '<div class="row">';
      html += '<span class="name">'+escapeHtml(e.name || "הכנסה")+'</span>';
      html += '<span class="amount">'+money(e.amount)+'</span>';
      html += '<span class="actions">';
      html += '<button data-act="edit-income" data-id="'+e.id+'" aria-label="עריכה">✎</button>';
      html += '<button data-act="del-income" data-id="'+e.id+'" aria-label="מחיקה">🗑</button>';
      html += '</span></div>';
    });
    list.innerHTML = html;
  }

  function incomeFormHtml(existing){
    var isEdit = !!existing;
    return '<h3>'+(isEdit? 'עריכת הכנסה' : 'הכנסה חדשה')+'</h3>'+
      '<div class="field"><label>מקור ההכנסה</label><input type="text" id="in-name" placeholder="לדוגמה: משכורת" value="'+(isEdit?escapeHtml(existing.name||''):'')+'"></div>'+
      '<div class="field"><label>סכום (₪)</label><input type="number" inputmode="decimal" id="in-amount" placeholder="0" value="'+(isEdit?existing.amount:'')+'"></div>'+
      '<div class="form-actions">'+
        (isEdit? '<button class="btn-danger" id="in-delete" type="button">מחיקה</button>' : '')+
        '<button class="btn-cancel" id="in-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="in-save" type="button">שמירה</button>'+
      '</div>';
  }

  function openIncomeForm(existing){
    if(!existing) unanchorForm("formIncome");
    editingIncomeId = existing ? existing.id : null;
    var card = document.getElementById("formIncome");
    card.innerHTML = incomeFormHtml(existing);
    card.style.display = "block";
    document.getElementById("btnAddIncome").style.display = "none";
    document.getElementById("in-save").addEventListener("click", function(){
      var name = document.getElementById("in-name").value.trim();
      var amount = parseFloat(document.getElementById("in-amount").value);
      if(isNaN(amount) || amount < 0){ showToast("נא להזין סכום תקין"); return; }
      if(editingIncomeId){
        var e = data.incomes.find(function(x){ return x.id===editingIncomeId; });
        e.name=name; e.amount=amount;
      } else {
        data.incomes.push({id:uid(), name:name, amount:amount, year:viewYear, month:viewMonth+1});
      }
      save(); closeIncomeForm(); renderAll();
      showToast("נשמר");
    });
    document.getElementById("in-cancel").addEventListener("click", closeIncomeForm);
    var del = document.getElementById("in-delete");
    if(del) del.addEventListener("click", function(){
      data.incomes = data.incomes.filter(function(x){ return x.id!==editingIncomeId; });
      save(); closeIncomeForm(); renderAll();
      showToast("נמחק");
    });
  }
  function closeIncomeForm(){
    unanchorForm("formIncome");
    document.getElementById("formIncome").style.display = "none";
    document.getElementById("btnAddIncome").style.display = "block";
    editingIncomeId = null;
  }

  /* ---------- Categories (in Settings) ---------- */
  function renderCategories(){
    var list = document.getElementById("catList");
    document.getElementById("catCount").textContent = data.categories.length + " קטגוריות";
    if(data.categories.length === 0){
      list.innerHTML = '<div class="empty"><span class="big">🏷️</span>אין קטגוריות עדיין.</div>';
      return;
    }
    var html = "";
    data.categories.forEach(function(c){
      var usageCount = data.fixedExpenses.filter(function(e){return e.categoryId===c.id;}).length +
                        data.variableExpenses.filter(function(e){return e.categoryId===c.id;}).length +
                        data.annualExpenses.filter(function(e){return e.categoryId===c.id;}).length;
      html += '<div class="cat-row">';
      html += '<span class="swatch" style="background:'+c.color+'"></span>';
      html += '<span class="name">'+escapeHtml(c.name)+'</span>';
      html += '<span class="count">'+(usageCount? usageCount+' שימושים' : '')+'</span>';
      html += '<span class="actions">';
      html += '<button data-act="edit-cat" data-id="'+c.id+'" aria-label="עריכה">✎</button>';
      html += '<button data-act="del-cat" data-id="'+c.id+'" aria-label="מחיקה">🗑</button>';
      html += '</span></div>';
    });
    list.innerHTML = html;
  }

  function colorPickerHtml(selected){
    var isCustom = selected && DEFAULT_COLORS.indexOf(selected) === -1;
    return DEFAULT_COLORS.map(function(c){
      return '<button type="button" class="swatch-btn'+(c===selected?' selected':'')+'" data-color="'+c+'" style="background:'+c+'"></button>';
    }).join("") +
      '<label class="swatch-btn swatch-custom'+(isCustom?' selected':'')+'" title="צבע אחר"'+(isCustom?' style="background:'+selected+'"':'')+'>'+
        '<input type="color" id="cat-color-custom" value="'+(isCustom?selected:'#5FA98A')+'"></label>';
  }

  function catFormHtml(existing){
    var isEdit = !!existing;
    var selColor = isEdit ? existing.color : DEFAULT_COLORS[data.categories.length % DEFAULT_COLORS.length];
    return '<h3>'+(isEdit? 'עריכת קטגוריה' : 'קטגוריה חדשה')+'</h3>'+
      '<div class="field"><label>שם הקטגוריה</label><input type="text" id="cat-name" placeholder="לדוגמה: ביגוד" value="'+(isEdit?escapeHtml(existing.name):'')+'"></div>'+
      '<div class="field"><label>צבע</label><div class="color-picker" id="cat-color-picker" data-selected="'+selColor+'">'+colorPickerHtml(selColor)+'</div></div>'+
      '<div class="form-actions">'+
        (isEdit? '<button class="btn-danger" id="cat-delete" type="button">מחיקה</button>' : '')+
        '<button class="btn-cancel" id="cat-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="cat-save" type="button">שמירה</button>'+
      '</div>';
  }

  function openCatForm(existing){
    if(!existing) unanchorForm("formCat");
    editingCatId = existing ? existing.id : null;
    var card = document.getElementById("formCat");
    card.innerHTML = catFormHtml(existing);
    card.style.display = "block";
    document.getElementById("btnAddCat").style.display = "none";
    var picker = document.getElementById("cat-color-picker");
    picker.addEventListener("click", function(ev){
      var btn = ev.target.closest(".swatch-btn");
      if(!btn || btn.classList.contains("swatch-custom")) return;
      picker.querySelectorAll(".swatch-btn").forEach(function(b){ b.classList.remove("selected"); });
      btn.classList.add("selected");
      picker.dataset.selected = btn.dataset.color;
    });
    var customInput = document.getElementById("cat-color-custom");
    customInput.addEventListener("input", function(){
      var lbl = customInput.parentNode;
      picker.querySelectorAll(".swatch-btn").forEach(function(b){ b.classList.remove("selected"); });
      lbl.classList.add("selected");
      lbl.style.background = customInput.value;
      picker.dataset.selected = customInput.value;
    });
    document.getElementById("cat-save").addEventListener("click", function(){
      var name = document.getElementById("cat-name").value.trim();
      var color = picker.dataset.selected;
      if(!name){ showToast("נא להזין שם קטגוריה"); return; }
      if(editingCatId){
        var c = data.categories.find(function(x){ return x.id===editingCatId; });
        c.name = name; c.color = color;
      } else {
        data.categories.push({id:uid(), name:name, color:color});
      }
      save(); closeCatForm(); renderAll();
      showToast("נשמר");
    });
    document.getElementById("cat-cancel").addEventListener("click", closeCatForm);
    var del = document.getElementById("cat-delete");
    if(del) del.addEventListener("click", function(){
      var inUse = data.fixedExpenses.some(function(e){return e.categoryId===editingCatId;}) ||
                  data.variableExpenses.some(function(e){return e.categoryId===editingCatId;}) ||
                  data.annualExpenses.some(function(e){return e.categoryId===editingCatId;});
      if(inUse){ showToast("לא ניתן למחוק — הקטגוריה בשימוש"); return; }
      data.categories = data.categories.filter(function(x){ return x.id!==editingCatId; });
      save(); closeCatForm(); renderAll();
      showToast("נמחק");
    });
  }
  function closeCatForm(){
    unanchorForm("formCat");
    document.getElementById("formCat").style.display = "none";
    document.getElementById("btnAddCat").style.display = "block";
    editingCatId = null;
  }

  /* ---------- History (by year) ---------- */
  var historyFilterWired = false;
  function renderHistory(){
    var sel = document.getElementById("historyCatFilter");
    historyCatFilter = populateCatFilterSelect(sel, historyCatFilter);
    if(!historyFilterWired){
      historyFilterWired = true;
      sel.addEventListener("change", function(){
        historyCatFilter = sel.value;
        renderHistory();
      });
    }

    document.getElementById("yearLabelHist").textContent = String(historyYear);
    var filterCat = historyCatFilter ? getCat(historyCatFilter) : null;
    var monthTotals = [];
    for(var m=0;m<12;m++){
      monthTotals.push(historyCatFilter ? monthTotalForCategory(historyYear, m, historyCatFilter) : monthTotal(historyYear, m));
    }
    var max = Math.max.apply(null, monthTotals.concat([1]));
    var chart = document.getElementById("historyMonthsChart");
    var barColor = filterCat ? filterCat.color : "var(--mustard)";
    var html = "";
    for(var m2=0;m2<12;m2++){
      var pct = Math.round((monthTotals[m2]/max)*100);
      var isSel = (m2+1) === historySelectedMonth;
      html += '<div class="bar-row clickable'+(isSel?' selected':'')+'" data-month="'+(m2+1)+'">';
      html += '<div class="top"><span class="k">'+HE_MONTHS[m2]+'</span><span class="v">'+money(monthTotals[m2])+'</span></div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:'+barColor+';"></div></div>';
      html += '</div>';
    }
    chart.innerHTML = html;
    chart.querySelectorAll(".bar-row").forEach(function(row){
      row.addEventListener("click", function(){
        historySelectedMonth = Number(row.dataset.month);
        renderHistory();
      });
    });

    document.getElementById("historyMonthLabel").textContent = HE_MONTHS[historySelectedMonth-1] + " " + historyYear;
    var byCatBox = document.getElementById("historyByCategory");
    var totalsByCat = {};
    data.fixedExpenses.forEach(function(e){
      if(fixedAppliesTo(e, historyYear, historySelectedMonth)){
        totalsByCat[e.categoryId] = (totalsByCat[e.categoryId]||0) + Number(e.amount||0);
      }
    });
    data.annualExpenses.forEach(function(e){
      var monthsOk = (e.months||[]).indexOf(historySelectedMonth) !== -1;
      var yearOk = e.everyYear !== false || (e.years||[]).indexOf(historyYear) !== -1;
      if(monthsOk && yearOk){
        totalsByCat[e.categoryId] = (totalsByCat[e.categoryId]||0) + Number(e.amount||0);
      }
    });
    var key = historyYear + "-" + String(historySelectedMonth).padStart(2,"0");
    data.variableExpenses.filter(function(e){ return inBudgetMonth(e, key); }).forEach(function(e){
      totalsByCat[e.categoryId] = (totalsByCat[e.categoryId]||0) + Number(e.amount||0);
    });
    var catIds = Object.keys(totalsByCat).filter(function(id){ return totalsByCat[id] > 0; });
    if(catIds.length === 0){
      byCatBox.innerHTML = '<div class="empty">אין נתונים לחודש זה עדיין.</div>';
      return;
    }
    var maxCat = Math.max.apply(null, catIds.map(function(id){ return totalsByCat[id]; }));
    catIds.sort(function(a,b){ return totalsByCat[b]-totalsByCat[a]; });
    var html2 = "";
    catIds.forEach(function(id){
      var cat = getCat(id);
      var val = totalsByCat[id];
      var pct = Math.round((val/maxCat)*100);
      html2 += '<div class="bar-row">';
      html2 += '<div class="top"><span class="k">'+(cat?escapeHtml(cat.name):'ללא קטגוריה')+'</span><span class="v">'+money(val)+'</span></div>';
      html2 += '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:'+(cat?cat.color:'#999')+';"></div></div>';
      html2 += '</div>';
    });
    byCatBox.innerHTML = html2;
  }

  /* ---------- Annual overview screen (ספירה שנתית) ---------- */
  var annualFilterWired = false;
  function renderAnnual(){
    var sel = document.getElementById("annualCatFilter");
    annualCatFilter = populateCatFilterSelect(sel, annualCatFilter);
    if(!annualFilterWired){
      annualFilterWired = true;
      sel.addEventListener("change", function(){
        annualCatFilter = sel.value;
        renderAnnual();
      });
    }

    document.getElementById("yearLabel").textContent = String(annualYear);
    var filterCat = annualCatFilter ? getCat(annualCatFilter) : null;
    document.getElementById("yearTotalLabel").textContent = filterCat
      ? "סה״כ " + filterCat.name + " לשנה"
      : "סה״כ צפי הוצאות לשנה";

    var total = 0;
    var monthTotals = [];
    for(var m=0;m<12;m++){
      var t = annualCatFilter ? monthTotalForCategory(annualYear, m, annualCatFilter) : monthTotal(annualYear, m);
      monthTotals.push(t); total += t;
    }
    document.getElementById("yearTotalNum").textContent = money(total);

    var max = Math.max.apply(null, monthTotals.concat([1]));
    var chart = document.getElementById("yearMonthsChart");
    var barColor = filterCat ? filterCat.color : "var(--plum)";
    var html = "";
    for(var m2=0;m2<12;m2++){
      var pct = Math.round((monthTotals[m2]/max)*100);
      html += '<div class="bar-row">';
      html += '<div class="top"><span class="k">'+HE_MONTHS[m2]+'</span><span class="v">'+money(monthTotals[m2])+'</span></div>';
      html += '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:'+barColor+';"></div></div>';
      html += '</div>';
    }
    chart.innerHTML = html;
  }

  /* ---------- Annual expenses management (הוצאות שנתיות) ---------- */
  var YEARS_RANGE = (function(){
    var arr = [];
    for(var y = today.getFullYear()-1; y <= today.getFullYear()+6; y++){ arr.push(y); }
    return arr;
  })();

  function yearsLabel(e){
    if(e.everyYear !== false) return "כל שנה";
    if(!e.years || e.years.length===0) return "ללא שנה נבחרת";
    return e.years.slice().sort(function(a,b){return a-b;}).join(", ");
  }

  function renderAnnualExpenses(){
    var list = document.getElementById("annualList");
    var items = data.annualExpenses.slice();
    document.getElementById("annualCount").textContent = items.length ? (items.length + " פריטים") : "";
    if(items.length === 0){
      list.innerHTML = '<div class="empty"><span class="big">🎯</span>אין עדיין הוצאות שנתיות.<br>לדוגמה: ביטוח רכב, חופשה, חגים.</div>';
      return;
    }
    var html = "";
    items.forEach(function(e){
      var cat = getCat(e.categoryId);
      html += '<div class="row">';
      html += '<span class="name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+(cat?cat.color:'#999')+';margin-inline-end:6px;"></span>'+escapeHtml(e.name)+
        '<span class="tag">'+money(e.amount)+' · '+monthsLabel(e.months)+' · '+yearsLabel(e)+'</span></span>';
      html += '<span class="actions">';
      html += '<button data-act="edit-annual" data-id="'+e.id+'" aria-label="עריכה">✎</button>';
      html += '<button data-act="del-annual" data-id="'+e.id+'" aria-label="מחיקה">🗑</button>';
      html += '</span></div>';
    });
    list.innerHTML = html;
  }

  function yearsGridHtml(selectedYears){
    var sel = selectedYears || [budgetNowYear];
    var html = '<div class="months-quick">'+
      '<button type="button" id="yg-all">בחרי הכל</button>'+
      '<button type="button" id="yg-none">נקה בחירה</button></div>'+
      '<div class="months-grid">';
    YEARS_RANGE.forEach(function(y){
      var checked = sel.indexOf(y) !== -1;
      html += '<label><input type="checkbox" class="yg-cb" value="'+y+'"'+(checked?' checked':'')+'><span>'+y+'</span></label>';
    });
    html += '</div>';
    return html;
  }
  function wireYearsGrid(card){
    card.querySelector("#yg-all").addEventListener("click", function(){
      card.querySelectorAll(".yg-cb").forEach(function(cb){ cb.checked = true; });
    });
    card.querySelector("#yg-none").addEventListener("click", function(){
      card.querySelectorAll(".yg-cb").forEach(function(cb){ cb.checked = false; });
    });
  }
  function readYearsGrid(card){
    return Array.prototype.slice.call(card.querySelectorAll(".yg-cb"))
      .filter(function(cb){ return cb.checked; })
      .map(function(cb){ return Number(cb.value); });
  }

  function annualFormHtml(existing){
    var isEdit = !!existing;
    var everyYearDefault = isEdit ? (existing.everyYear !== false) : true;
    var defaultMonths = isEdit ? existing.months : [budgetNowMonth+1];
    var defaultYears = isEdit && existing.years && existing.years.length ? existing.years : [budgetNowYear];
    return '<h3>'+(isEdit? 'עריכת הוצאה שנתית' : 'הוצאה שנתית חדשה')+'</h3>'+
      '<div class="field"><label>שם ההוצאה</label><input type="text" id="an-name" placeholder="לדוגמה: ביטוח רכב" value="'+(isEdit?escapeHtml(existing.name):'')+'"></div>'+
      '<div class="field"><label>קטגוריה</label><select id="an-cat">'+catOptionsHtml(isEdit?existing.categoryId:data.categories[0] && data.categories[0].id)+'</select></div>'+
      '<div class="field"><label>סכום לתשלום (₪)</label><input type="number" inputmode="decimal" id="an-amount" placeholder="0" value="'+(isEdit?existing.amount:'')+'"></div>'+
      '<div class="field"><label>באילו חודשים זה חל</label>'+monthsGridHtml(defaultMonths)+'</div>'+
      '<div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="an-everyyear" style="width:auto;"'+(everyYearDefault?' checked':'')+'> חוזר כל שנה</label></div>'+
      '<div class="field" id="an-years-wrap" style="display:'+(everyYearDefault?'none':'block')+';"><label>באילו שנים זה חל</label>'+yearsGridHtml(defaultYears)+'</div>'+
      '<div class="form-actions">'+
        (isEdit? '<button class="btn-danger" id="an-delete" type="button">מחיקה</button>' : '')+
        '<button class="btn-cancel" id="an-cancel" type="button">ביטול</button>'+
        '<button class="btn-save" id="an-save" type="button">שמירה</button>'+
      '</div>';
  }

  function openAnnualForm(existing){
    if(!existing) unanchorForm("formAnnual");
    editingAnnualId = existing ? existing.id : null;
    var card = document.getElementById("formAnnual");
    card.innerHTML = annualFormHtml(existing);
    card.style.display = "block";
    document.getElementById("btnAddAnnual").style.display = "none";
    wireMonthsGrid(card);
    wireYearsGrid(card);
    var everyYearCb = document.getElementById("an-everyyear");
    var yearsWrap = document.getElementById("an-years-wrap");
    everyYearCb.addEventListener("change", function(){
      yearsWrap.style.display = everyYearCb.checked ? "none" : "block";
    });

    document.getElementById("an-save").addEventListener("click", function(){
      var name = document.getElementById("an-name").value.trim();
      var cat = document.getElementById("an-cat").value;
      var amount = parseFloat(document.getElementById("an-amount").value);
      var months = readMonthsGrid(card);
      var everyYear = everyYearCb.checked;
      var years = everyYear ? [] : readYearsGrid(card);
      if(!name){ showToast("נא להזין שם"); return; }
      if(isNaN(amount) || amount < 0){ showToast("נא להזין סכום תקין"); return; }
      if(months.length === 0){ showToast("נא לבחור לפחות חודש אחד"); return; }
      if(!everyYear && years.length === 0){ showToast("נא לבחור לפחות שנה אחת"); return; }
      if(editingAnnualId){
        var e = data.annualExpenses.find(function(x){ return x.id===editingAnnualId; });
        e.name=name; e.categoryId=cat; e.amount=amount; e.months=months; e.everyYear=everyYear; e.years=years;
      } else {
        data.annualExpenses.push({id:uid(), name:name, categoryId:cat, amount:amount, months:months, everyYear:everyYear, years:years});
      }
      save(); closeAnnualForm(); renderAll();
      showToast("נשמר");
    });
    document.getElementById("an-cancel").addEventListener("click", closeAnnualForm);
    var del = document.getElementById("an-delete");
    if(del) del.addEventListener("click", function(){
      data.annualExpenses = data.annualExpenses.filter(function(x){ return x.id!==editingAnnualId; });
      save(); closeAnnualForm(); renderAll();
      showToast("נמחק");
    });
  }
  function closeAnnualForm(){
    unanchorForm("formAnnual");
    document.getElementById("formAnnual").style.display = "none";
    document.getElementById("btnAddAnnual").style.display = "block";
    editingAnnualId = null;
  }

  /* ---------- Inline edit forms (open under the edited row) ---------- */
  var FORM_ACTS = {"edit-fixed":"formFixed","edit-variable":"formVariable","edit-income":"formIncome","edit-cat":"formCat","edit-annual":"formAnnual"};
  var formHomes = {}, formAnchors = {};
  Object.keys(FORM_ACTS).forEach(function(act){
    var card = document.getElementById(FORM_ACTS[act]);
    formHomes[card.id] = {parent:card.parentNode, next:card.nextSibling};
  });
  function sendFormHome(cardId){
    var card = document.getElementById(cardId), home = formHomes[cardId];
    if(card.parentNode !== home.parent || card.nextSibling !== home.next) home.parent.insertBefore(card, home.next);
  }
  function placeFormUnderRow(act, id){
    var cardId = FORM_ACTS[act];
    var btn = document.querySelector('button[data-act="'+act+'"][data-id="'+id+'"]');
    var row = btn && btn.closest(".row, .cat-row");
    if(!row) return;
    formAnchors[cardId] = {act:act, id:id};
    row.parentNode.insertBefore(document.getElementById(cardId), row.nextSibling);
  }
  function unanchorForm(cardId){
    delete formAnchors[cardId];
    sendFormHome(cardId);
  }

  /* ---------- Global click delegation ---------- */
  document.addEventListener("click", function(ev){
    var btn = ev.target.closest("button[data-act]");
    if(!btn) return;
    var act = btn.dataset.act;
    var id = btn.dataset.id;
    if(FORM_ACTS[act]){
      handleRowAction(act, id);
      placeFormUnderRow(act, id);
      var card = document.getElementById(FORM_ACTS[act]);
      if(card.scrollIntoView) card.scrollIntoView({behavior:"smooth", block:"nearest"});
      return;
    }
    handleRowAction(act, id);
  });
  function handleRowAction(act, id){

    if(act==="edit-fixed"){ openFixedForm(data.fixedExpenses.find(function(x){return x.id===id;})); }
    else if(act==="del-fixed"){
      if(confirm("למחוק את ההוצאה הקבועה?")){
        data.fixedExpenses = data.fixedExpenses.filter(function(x){return x.id!==id;});
        save(); renderAll(); showToast("נמחק");
      }
    } else if(act==="edit-variable"){ openVariableForm(data.variableExpenses.find(function(x){return x.id===id;})); }
    else if(act==="del-variable"){
      if(confirm("למחוק את ההוצאה?")){
        data.variableExpenses = data.variableExpenses.filter(function(x){return x.id!==id;});
        save(); renderAll(); showToast("נמחק");
      }
    } else if(act==="edit-income"){ openIncomeForm(data.incomes.find(function(x){return x.id===id;})); }
    else if(act==="del-income"){
      if(confirm("למחוק את ההכנסה?")){
        data.incomes = data.incomes.filter(function(x){return x.id!==id;});
        save(); renderAll(); showToast("נמחק");
      }
    } else if(act==="edit-cat"){ openCatForm(data.categories.find(function(x){return x.id===id;})); }
    else if(act==="del-cat"){
      var inUse = data.fixedExpenses.some(function(e){return e.categoryId===id;}) ||
                  data.variableExpenses.some(function(e){return e.categoryId===id;}) ||
                  data.annualExpenses.some(function(e){return e.categoryId===id;});
      if(inUse){ showToast("לא ניתן למחוק — הקטגוריה בשימוש"); return; }
      if(confirm("למחוק את הקטגוריה?")){
        data.categories = data.categories.filter(function(x){return x.id!==id;});
        save(); renderAll(); showToast("נמחק");
      }
    } else if(act==="edit-annual"){ openAnnualForm(data.annualExpenses.find(function(x){return x.id===id;})); }
    else if(act==="del-annual"){
      if(confirm("למחוק את ההוצאה השנתית?")){
        data.annualExpenses = data.annualExpenses.filter(function(x){return x.id!==id;});
        save(); renderAll(); showToast("נמחק");
      }
    }
  }

  /* ---------- Month / Year nav ---------- */
  function stepMonth(delta){
    viewMonth += delta;
    if(viewMonth<0){ viewMonth=11; viewYear--; }
    if(viewMonth>11){ viewMonth=0; viewYear++; }
    renderAll();
  }
  document.getElementById("prevMonth").addEventListener("click", function(){ stepMonth(-1); });
  document.getElementById("nextMonth").addEventListener("click", function(){ stepMonth(1); });
  document.getElementById("prevYearHist").addEventListener("click", function(){ historyYear--; renderAll(); });
  document.getElementById("nextYearHist").addEventListener("click", function(){ historyYear++; renderAll(); });
  document.getElementById("prevYear").addEventListener("click", function(){ annualYear--; renderAll(); });
  document.getElementById("nextYear").addEventListener("click", function(){ annualYear++; renderAll(); });

  /* ---------- Add buttons ---------- */
  document.getElementById("btnAddFixed").addEventListener("click", function(){ openFixedForm(null); });
  document.getElementById("btnAddVariable").addEventListener("click", function(){ openVariableForm(null); });
  document.getElementById("btnImportCsv").addEventListener("click", function(){
    document.getElementById("csvFileInput").click();
  });
  document.getElementById("csvFileInput").addEventListener("change", function(ev){
    var file = ev.target.files && ev.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      try{
        var text = e.target.result;
        var delim = detectDelimiter(text);
        var rows = parseCSV(text, delim);
        if(rows.length < 2){ showToast("הקובץ ריק או לא בפורמט תקין"); return; }
        csvRows = rows;
        openImportCard(rows[0]);
      }catch(err){
        showToast("שגיאה בקריאת הקובץ");
      }
    };
    reader.onerror = function(){ showToast("שגיאה בקריאת הקובץ"); };
    reader.readAsText(file, "UTF-8");
  });
  document.getElementById("btnAddIncome").addEventListener("click", function(){ openIncomeForm(null); });
  document.getElementById("btnAddCat").addEventListener("click", function(){ openCatForm(null); });
  document.getElementById("btnAddAnnual").addEventListener("click", function(){ openAnnualForm(null); });

  /* ---------- Init ---------- */
  function renderAll(){
    if(formHomes) Object.keys(formHomes).forEach(sendFormHome);
    renderHomeStats();
    if(currentScreen === "month"){ renderMonthFilter(); renderMonthHeader(); renderFixed(); renderVariable(); renderIncome(); }
    if(currentScreen === "history"){ renderHistory(); }
    if(currentScreen === "annual"){ renderAnnual(); }
    if(currentScreen === "annualexp"){ renderAnnualExpenses(); }
    if(currentScreen === "settings"){ renderCategories(); }
    if(formAnchors) Object.keys(formAnchors).forEach(function(cardId){
      placeFormUnderRow(formAnchors[cardId].act, formAnchors[cardId].id);
    });
  }
})();
