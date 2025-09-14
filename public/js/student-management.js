import {
  getAuth,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js"
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  FieldValue,
  writeBatch,
  increment,
  serverTimestamp,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js"

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-rXYqdJ5ujIxWNt4PjSJh4FtDyc3hieI",
  authDomain: "codequest-2025.firebaseapp.com",
  projectId: "codequest-2025",
  storageBucket: "codequest-2025.firebasestorage.app",
  messagingSenderId: "5857953993",
  appId: "1:5857953993:web:79cc6a52b3baf9b7b52518",
}

// Initialize Firebase if not already initialized
import {
  getApp,
  initializeApp as initializeFirebaseApp,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js"

let firebaseApp
try {
  firebaseApp = getApp()
} catch (e) {
  firebaseApp = initializeFirebaseApp(firebaseConfig)
}

// References to Firebase services
const auth = getAuth(firebaseApp)
const db = getFirestore(firebaseApp)

// Global variables
let allStudents = []
let filteredStudents = []
let currentStudent = null
let currentAction = null
let description = null
const selectedStudents = new Set()

// DOM Elements
const loadingElement = document.getElementById("loading")
const studentsTable = document.getElementById("students-table")
const studentsTbody = document.getElementById("students-tbody")
const emptyState = document.getElementById("empty-state")

// Filter elements
const searchInput = document.getElementById("search-input")
const sectionFilter = document.getElementById("section-filter")
const statusFilter = document.getElementById("status-filter")

// Modal elements
const profileModal = document.getElementById("profile-modal")
const editModal = document.getElementById("edit-modal")
const banModal = document.getElementById("ban-modal")
const deleteModal = document.getElementById("delete-modal")
const bulkBanModal = document.getElementById("bulk-ban-modal")
const bulkDeleteModal = document.getElementById("bulk-delete-modal")
const bulkUnbanModal = document.getElementById("bulk-unban-modal")

// Bulk action elements
const bulkActionsElement = document.getElementById("bulk-actions")
const selectedCountElement = document.getElementById("selected-count")

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loadStudents()
      setupEventListeners()
    } else {
      window.location.href = "login.html"
    }
  })
})

// Setup event listeners
function setupEventListeners() {
  searchInput.addEventListener("input", filterStudents)
  sectionFilter.addEventListener("change", filterStudents)
  statusFilter.addEventListener("change", filterStudents)
}

// Mobile sidebar toggle
function toggleMobileSidebar() {
  const sidebar = document.getElementById("sidebar")
  const overlay = document.getElementById("sidebar-overlay")
  const mainContent = document.getElementById("main-content")

  sidebar.classList.toggle("mobile-visible")
  overlay.classList.toggle("active")
}

// Utility Functions
function showLoading() {
  loadingElement.style.display = "block"
  studentsTable.style.display = "none"
  emptyState.style.display = "none"
}

function hideLoading() {
  loadingElement.style.display = "none"
}

function showAlert(message, type) {
  const alertElement = document.getElementById("alert")
  const alertMessage = document.getElementById("alert-message")

  alertElement.className = "alert " + type
  alertMessage.textContent = message
  alertElement.style.display = "flex"

  setTimeout(() => {
    closeAlert()
  }, 5000)
}

function closeAlert() {
  const alertElement = document.getElementById("alert")
  alertElement.style.display = "none"
}

function getInitials(name) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)
}

function closeAllModals() {
  const modals = document.querySelectorAll(".modal")
  modals.forEach((modal) => {
    modal.style.display = "none"
  })
  currentStudent = null
  currentAction = null
}

// Load all students from all classes
async function loadStudents() {
  try {
    showLoading()

    allStudents = []
    const sections = new Set()

    // Get current admin UID
    const currentUser = auth.currentUser
    const adminUid = currentUser ? currentUser.uid : null

    if (!adminUid) {
      showAlert("Admin not authenticated.", "error")
      hideLoading()
      return
    }

    // Query classes created by this admin
    const classesQuery = query(collection(db, "classes"), where("createdBy", "==", adminUid))
    const classesSnapshot = await getDocs(classesQuery)

    // For each class, get all students
    for (const classDoc of classesSnapshot.docs) {
      const classData = classDoc.data()
      sections.add(classData.className)

      const studentsSnapshot = await getDocs(collection(db, "classes", classDoc.id, "students"))

      studentsSnapshot.forEach((studentDoc) => {
        const studentData = studentDoc.data()
        allStudents.push({
          id: studentDoc.id,
          classId: classDoc.id,
          className: classData.className,
          classCode: classData.classCode,
          ...studentData,
        })
      })
    }

    // Populate section filter
    populateSectionFilter(sections)

    // Update stats
    updateStats()

    // Apply filters and display
    filteredStudents = [...allStudents]
    displayStudents()
  } catch (error) {
    console.error("Error loading students:", error)
    showAlert("Error loading students. Please try again.", "error")
    hideLoading()
  }
}

// Populate section filter dropdown
function populateSectionFilter(sections) {
  sectionFilter.innerHTML = '<option value="">All Sections</option>'

  Array.from(sections)
    .sort()
    .forEach((section) => {
      const option = document.createElement("option")
      option.value = section
      option.textContent = section
      sectionFilter.appendChild(option)
    })
}

// Update statistics
function updateStats() {
  const totalStudents = allStudents.length
  const activeStudents = allStudents.filter((s) => s.isActive !== false && s.status !== "banned"|| s.status !== "pending").length
  const bannedStudents = allStudents.filter((s) => s.status === "banned").length

  // Get unique classes
  const uniqueClasses = new Set(allStudents.map((s) => s.classId)).size

  document.getElementById("total-students").textContent = totalStudents
  document.getElementById("active-students").textContent = activeStudents
  document.getElementById("banned-students").textContent = bannedStudents
  document.getElementById("total-classes").textContent = uniqueClasses
}

// Filter students based on search and filters
function filterStudents() {
  const searchTerm = searchInput.value.toLowerCase()
  const selectedSection = sectionFilter.value
  const selectedStatus = statusFilter.value

  filteredStudents = allStudents.filter((student) => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      (student.fullName && student.fullName.toLowerCase().includes(searchTerm)) ||
      (student.email && student.email.toLowerCase().includes(searchTerm)) ||
      (student.studentNumber && student.studentNumber.toLowerCase().includes(searchTerm))

    // Section filter
    const matchesSection = !selectedSection || student.className === selectedSection

    // Status filter
    let matchesStatus = true
    if (selectedStatus) {
      if (selectedStatus === "active") {
        matchesStatus = student.isActive !== false && student.status !== "banned"
      } else if (selectedStatus === "banned") {
        matchesStatus = student.status === "banned"
      } else if (selectedStatus === "pending") {
        matchesStatus = student.status === "pending"
      }
    }

    return matchesSearch && matchesSection && matchesStatus
  })

  displayStudents()
}

// Display students in table
function displayStudents() {
  hideLoading()

  if (filteredStudents.length === 0) {
    studentsTable.style.display = "none"
    emptyState.style.display = "block"
    clearSelection()
    return
  }

  emptyState.style.display = "none"
  studentsTable.style.display = "table"

  studentsTbody.innerHTML = ""

  filteredStudents.forEach((student) => {
    const row = createStudentRow(student)
    studentsTbody.appendChild(row)
  })

  updateBulkActionsVisibility()
  updateSelectAllState()
}

// Create student table row with clickable name and avatar
function createStudentRow(student) {
  const row = document.createElement("tr")
  row.className = "student-row"

  // Get initials for avatar
  const initials = getInitials(student.name || "Unknown")

  // Format registration date
  const regDate = student.createdAt ? new Date(student.createdAt.toDate()).toLocaleDateString() : "N/A"

  // Determine status
  let status = "Active"
  let statusClass = "status-active"

  if (student.status === "banned") {
    status = "Banned"
    statusClass = "status-banned"
  } else if (student.status === "pending") {
    status = "Pending"
    statusClass = "status-pending"
  }

  const studentKey = `${student.id}_${student.classId}`
  const isSelected = selectedStudents.has(studentKey)

  row.innerHTML = `
      <td>
          <input type="checkbox" class="student-checkbox" 
                 ${isSelected ? "checked" : ""} 
                 onchange="toggleStudentSelection('${student.id}', '${student.classId}', this)">
      </td>
      <td>
          <div style="display: flex; align-items: center; gap: 10px;">
              <div class="student-avatar" onclick="openProfileModal('${student.id}', '${student.classId}')">${initials}</div>
              <div>
                  <div class="student-name" onclick="openProfileModal('${student.id}', '${student.classId}')" style="font-weight: 500;">${student.name || "Unknown"}</div>
                  <div class="hide-mobile" style="font-size: 12px; color: #666;">${student.email || "N/A"}</div>
              </div>
          </div>
      </td>
      <td class="hide-mobile">${student.studentNumber || "N/A"}</td>
      <td>${student.className || "N/A"}</td>
      <td class="hide-mobile">${regDate}</td>
      <td><span class="badge ${statusClass}">${status}</span></td>
      <td style="text-align: center;">
          ${status === "Banned"
      ? `<button class="btn-icon" title="Unban Student" onclick="openBanModal('${student.id}', '${student.classId}', 'unban')">
                  <i class="fas fa-undo" style="color: #28a745;"></i>
              </button>`
      : `<button class="btn-icon" title="Ban Student" onclick="openBanModal('${student.id}', '${student.classId}', 'ban')">
                  <i class="fas fa-ban" style="color: #ffc107;"></i>
              </button>`
    }
          <button class="btn-icon delete" title="Delete Student" onclick="openDeleteModal('${student.id}', '${student.classId}')">
              <i class="fas fa-trash"></i>
          </button>
      </td>
  `

  if (isSelected) {
    row.classList.add("selected")
  }

  return row
}

// Enhanced Bulk Selection Functions
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById("select-all")
  const studentCheckboxes = document.querySelectorAll(".student-checkbox")

  if (selectAllCheckbox.checked) {
    // Select all visible students
    filteredStudents.forEach((student) => {
      selectedStudents.add(`${student.id}_${student.classId}`)
    })
    studentCheckboxes.forEach((checkbox) => {
      checkbox.checked = true
      checkbox.closest("tr").classList.add("selected")
    })
  } else {
    // Deselect all
    selectedStudents.clear()
    studentCheckboxes.forEach((checkbox) => {
      checkbox.checked = false
      checkbox.closest("tr").classList.remove("selected")
    })
  }

  updateBulkActionsVisibility()
}

function toggleStudentSelection(studentId, classId, checkbox) {
  const studentKey = `${studentId}_${classId}`
  const row = checkbox.closest("tr")

  if (checkbox.checked) {
    selectedStudents.add(studentKey)
    row.classList.add("selected")
  } else {
    selectedStudents.delete(studentKey)
    row.classList.remove("selected")

    // Uncheck select all if not all are selected
    document.getElementById("select-all").checked = false
  }

  updateBulkActionsVisibility()
  updateSelectAllState()
}

function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById("select-all")
  const visibleStudentKeys = filteredStudents.map((s) => `${s.id}_${s.classId}`)
  const selectedVisibleCount = visibleStudentKeys.filter((key) => selectedStudents.has(key)).length

  if (selectedVisibleCount === 0) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = false
  } else if (selectedVisibleCount === visibleStudentKeys.length) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = true
  } else {
    selectAllCheckbox.indeterminate = true
    selectAllCheckbox.checked = false
  }
}

// Enhanced bulk actions visibility with smart button states
function updateBulkActionsVisibility() {
  const selectedCount = selectedStudents.size

  if (selectedCount > 0) {
    bulkActionsElement.style.display = "flex"
    selectedCountElement.textContent = `${selectedCount} selected`

    // Get selected students and count by status
    const selectedStudentsList = getSelectedStudents()
    const activeCount = selectedStudentsList.filter((s) => s.isActive !== false && s.status !== "banned").length
    const bannedCount = selectedStudentsList.filter((s) => s.status === "banned").length

    // Update bulk ban button
    const bulkBanBtn = document.getElementById("bulk-ban-btn")
    const banCountInfo = document.getElementById("ban-count-info")
    bulkBanBtn.disabled = activeCount === 0
    banCountInfo.textContent = `(${activeCount})`

    // Update bulk unban button
    const bulkUnbanBtn = document.getElementById("bulk-unban-btn")
    const unbanCountInfo = document.getElementById("unban-count-info")
    bulkUnbanBtn.disabled = bannedCount === 0
    unbanCountInfo.textContent = `(${bannedCount})`

    // Update bulk delete button (always enabled if students selected)
    const deleteCountInfo = document.getElementById("delete-count-info")
    deleteCountInfo.textContent = `(${selectedCount})`
  } else {
    bulkActionsElement.style.display = "none"
  }
}

function clearSelection() {
  selectedStudents.clear()
  document.querySelectorAll(".student-checkbox").forEach((checkbox) => {
    checkbox.checked = false
    checkbox.closest("tr").classList.remove("selected")
  })
  document.getElementById("select-all").checked = false
  updateBulkActionsVisibility()
}

function getSelectedStudents() {
  return Array.from(selectedStudents)
    .map((key) => {
      const [studentId, classId] = key.split("_")
      return allStudents.find((s) => s.id === studentId && s.classId === classId)
    })
    .filter(Boolean)
}

// Open student profile modal
async function openProfileModal(studentId, classId) {
  try {
    const student = allStudents.find((s) => s.id === studentId && s.classId === classId)
    if (!student) {
      showAlert("Student not found.", "error")
      return
    }

    currentStudent = student

    // Populate basic info
    document.getElementById("profile-avatar").textContent = getInitials(student.fullName || student.name || "Unknown")
    document.getElementById("profile-name").textContent = student.fullName || student.name || "Unknown"
    document.getElementById("profile-email").textContent = student.email || "N/A"
    document.getElementById("profile-section").textContent = student.className || "N/A"
    document.getElementById("profile-student-number").textContent = student.studentNumber || "N/A"

    // Load student progress and stats
    await loadStudentStats(studentId, classId)

    profileModal.style.display = "block"
  } catch (error) {
    console.error("Error opening profile modal:", error)
    showAlert("Error loading student profile.", "error")
  }
}

// Load student statistics and progress
async function loadStudentStats(studentId, classId) {
  try {
    // For now, we'll use placeholder data since the game progress structure isn't defined
    // In a real implementation, you would fetch from game_sessions, progress, scores collections

    // Placeholder stats
    document.getElementById("profile-xp").textContent = "1,250"
    document.getElementById("profile-score").textContent = "8,750"
    document.getElementById("profile-time").textContent = "12h 30m"
    document.getElementById("profile-progress").textContent = "75%"

    // Placeholder topic progress
    const topicProgress = document.getElementById("topic-progress")
    topicProgress.innerHTML = `
          <div class="progress-item">
              <span>Variables & Data Types</span>
              <div class="progress-bar">
                  <div class="progress-fill" style="width: 90%;"></div>
              </div>
              <span>90%</span>
          </div>
          <div class="progress-item">
              <span>Control Structures</span>
              <div class="progress-bar">
                  <div class="progress-fill" style="width: 75%;"></div>
              </div>
              <span>75%</span>
          </div>
          <div class="progress-item">
              <span>Functions</span>
              <div class="progress-bar">
                  <div class="progress-fill" style="width: 60%;"></div>
              </div>
              <span>60%</span>
          </div>
          <div class="progress-item">
              <span>Arrays & Objects</span>
              <div class="progress-bar">
                  <div class="progress-fill" style="width: 45%;"></div>
              </div>
              <span>45%</span>
          </div>
      `

    // TODO: Implement actual data fetching from:
    // - game_sessions collection for time tracking
    // - student_progress collection for topic progress
    // - student_scores collection for XP and scores
  } catch (error) {
    console.error("Error loading student stats:", error)
  }
}

// Open ban/unban modal
function openBanModal(studentId, classId, action) {
  const student = allStudents.find((s) => s.id === studentId && s.classId === classId)
  if (!student) {
    showAlert("Student not found.", "error")
    return
  }

  currentStudent = student
  currentAction = action

  const title = action === "ban" ? "Ban Student" : "Unban Student"
  const message =
    action === "ban"
      ? `Are you sure you want to ban ${student.fullName}? They will no longer be able to access the game.`
      : `Are you sure you want to unban ${student.fullName}? They will regain access to the game.`
  const buttonText = action === "ban" ? "Ban Student" : "Unban Student"
  const buttonClass = action === "ban" ? "btn-warning" : "btn-success"

  document.getElementById("ban-modal-title").textContent = title
  document.getElementById("ban-modal-message").textContent = message
  document.getElementById("admin-password-ban").value = ""

  const confirmBtn = document.getElementById("confirm-ban-btn")
  confirmBtn.textContent = buttonText
  confirmBtn.className = `btn ${buttonClass}`

  banModal.style.display = "block"
}

// Confirm ban/unban action
async function confirmBanAction() {
  const adminPassword = document.getElementById("admin-password-ban").value
  const act = currentAction
  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-ban-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'

  try {
    // Verify admin password
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    // Update student status
    console.log(`Current action: ${currentAction}`)
    const newStatus = currentAction === "ban" ? "banned" : "active"
    const isActive = currentAction === "ban" ? false : true

    await updateDoc(doc(db, "classes", currentStudent.classId, "students", currentStudent.id), {
      status: newStatus,
      isActive: isActive,
      [`${currentAction}nedAt`]: serverTimestamp(),
      [`${currentAction}nedBy`]: currentUser.uid,
    })

    description = currentAction === "ban" ? "banned" : "unbanned"

    // Log the action
    await addDoc(collection(db, "student_logs"), {
      action: `${currentAction} student`,
      description: currentStudent.fullName + ` has been ${description}.`,
      studentId: currentStudent.id,
      studentName: currentStudent.fullName,
      studentEmail: currentStudent.email,
      classId: currentStudent.classId,
      className: currentStudent.className,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeBanModal()
    console.log(act)
    const actionText = act === "ban" ? "banned" : "unbanned"
    showAlert(`Student ${actionText} successfully.`, "success")
    loadStudents() // Reload to reflect changes
  } catch (error) {
    console.error(`Error ${act}ning student:`, error)

    let errorMessage = `Error ${act}ning student.`
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.textContent = currentAction === "ban" ? "Ban Student" : "Unban Student"
  }
}

// Open delete modal
function openDeleteModal(studentId, classId) {
  const student = allStudents.find((s) => s.id === studentId && s.classId === classId)
  if (!student) {
    showAlert("Student not found.", "error")
    return
  }

  currentStudent = student
  document.getElementById("admin-password-delete").value = ""
  deleteModal.style.display = "block"
}

// Confirm delete student
async function confirmDeleteStudent() {
  const adminPassword = document.getElementById("admin-password-delete").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-delete-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'

  try {
    // Verify admin password
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    // Delete student document
    await deleteDoc(doc(db, "classes", currentStudent.classId, "students", currentStudent.id))

    // Log the action
    await addDoc(collection(db, "student_logs"), {
      action: "Deleted student",
      description: `${currentStudent.fullName} has been deleted.`,
      studentId: currentStudent.id,
      studentName: currentStudent.fullName,
      studentEmail: currentStudent.email,
      classId: currentStudent.classId,
      className: currentStudent.className,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeDeleteModal()
    showAlert("Student deleted successfully.", "success")
    loadStudents() // Reload to reflect changes
  } catch (error) {
    console.error("Error deleting student:", error)

    let errorMessage = "Error deleting student."
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.innerHTML = "Delete Student"
  }
}

// Enhanced Bulk Ban Functions - Only ban active students
function openBulkBanModal() {
  const selectedStudentsList = getSelectedStudents()
  const activeStudents = selectedStudentsList.filter((s) => s.isActive !== false && s.status !== "banned" || s.status !== "pending")

  if (activeStudents.length === 0) {
    showAlert("Please select active students to ban.", "warning")
    return
  }

  document.getElementById("bulk-ban-count").textContent = activeStudents.length
  document.getElementById("admin-password-bulk-ban").value = ""
  bulkBanModal.style.display = "block"
}

function closeBulkBanModal() {
  bulkBanModal.style.display = "none"
}

async function confirmBulkBan() {
  const adminPassword = document.getElementById("admin-password-bulk-ban").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-bulk-ban-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Banning...'

  try {
    // Verify admin password
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    const selectedStudentsList = getSelectedStudents()
    // Only process active students
    const activeStudents = selectedStudentsList.filter((s) => s.isActive !== false && s.status !== "banned"|| s.status !== "pending")
    const batch = writeBatch(db)

    // Update each active student
    activeStudents.forEach((student) => {
      const studentRef = doc(db, "classes", student.classId, "students", student.id)

      batch.update(studentRef, {
        status: "banned",
        isActive: false,
        bannedAt: serverTimestamp(),
        bannedBy: currentUser.uid,
      })
    })

    // Commit the batch
    await batch.commit()

    // Log the bulk action
    await addDoc(collection(db, "student_logs"), {
      action: "Bulk ban active students",
      description: `${activeStudents.length} students have been banned.`,
      studentCount: activeStudents.length,
      studentIds: activeStudents.map((s) => s.id),
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeBulkBanModal()
    clearSelection()
    showAlert(`${activeStudents.length} active students banned successfully.`, "success")
    loadStudents() // Reload to reflect changes
  } catch (error) {
    console.error("Error banning students:", error)

    let errorMessage = "Error banning students."
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.innerHTML = "Ban Active Students"
  }
}

// Enhanced Bulk Delete Functions - Delete all selected students regardless of status
function openBulkDeleteModal() {
  const selectedCount = selectedStudents.size
  if (selectedCount === 0) {
    showAlert("Please select students to delete.", "warning")
    return
  }

  document.getElementById("bulk-delete-count").textContent = selectedCount
  document.getElementById("admin-password-bulk-delete").value = ""
  bulkDeleteModal.style.display = "block"
}

function closeBulkDeleteModal() {
  bulkDeleteModal.style.display = "none"
}

async function confirmBulkDelete() {
  const adminPassword = document.getElementById("admin-password-bulk-delete").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-bulk-delete-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'

  try {
    // Verify admin password
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    const studentsToDelete = getSelectedStudents()
    const batch = writeBatch(db)

    // Group students by class for student count updates
    const classUpdates = {}

    // Delete each selected student (regardless of status)
    studentsToDelete.forEach((student) => {
      const studentRef = doc(db, "classes", student.classId, "students", student.id)

      batch.delete(studentRef)

      // Track class updates
      if (!classUpdates[student.classId]) {
        classUpdates[student.classId] = 0
      }
      classUpdates[student.classId]++
    })

    // Update class student counts
    Object.keys(classUpdates).forEach((classId) => {
      const classRef = doc(db, "classes", classId)
      batch.update(classRef, {
        studentCount: increment(-classUpdates[classId]),
      })
    })

    // Commit the batch
    await batch.commit()

    // Log the bulk action
    await addDoc(collection(db, "student_logs"), {
      action: "Bulk delete all students",
      description: `Deleted ${studentsToDelete.length} selected students.`,
      studentCount: studentsToDelete.length,
      studentIds: studentsToDelete.map((s) => s.id),
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeBulkDeleteModal()
    clearSelection()
    showAlert(`${studentsToDelete.length} students deleted successfully.`, "success")
    loadStudents() // Reload to reflect changes
  } catch (error) {
    console.error("Error deleting students:", error)

    let errorMessage = "Error deleting students."
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.innerHTML = "Delete All Students"
  }
}

// Enhanced Bulk Unban Functions - Only unban blocked students
function openBulkUnbanModal() {
  const selectedStudentsList = getSelectedStudents()
  const blockedStudents = selectedStudentsList.filter((s) => s.status === "banned")

  if (blockedStudents.length === 0) {
    showAlert("Please select blocked students to unban.", "warning")
    return
  }

  document.getElementById("bulk-unban-count").textContent = blockedStudents.length
  document.getElementById("admin-password-bulk-unban").value = ""
  bulkUnbanModal.style.display = "block"
}

function closeBulkUnbanModal() {
  bulkUnbanModal.style.display = "none"
}

async function confirmBulkUnban() {
  const adminPassword = document.getElementById("admin-password-bulk-unban").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  const confirmBtn = document.getElementById("confirm-bulk-unban-btn")
  confirmBtn.disabled = true
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unbanning...'

  try {
    // Verify admin password
    const currentUser = auth.currentUser
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)
    await reauthenticateWithCredential(currentUser, credential)

    const selectedStudentsList = getSelectedStudents()
    // Only process blocked students
    const blockedStudents = selectedStudentsList.filter((s) => s.status === "banned")
    const batch = writeBatch(db)

    // Update each blocked student
    blockedStudents.forEach((student) => {
      const studentRef = doc(db, "classes", student.classId, "students", student.id)

      batch.update(studentRef, {
        status: "active",
        isActive: true,
        unbannedAt: serverTimestamp(),
        unbannedBy: currentUser.uid,
        // Clear ban-related fields
        bannedAt: null,
        bannedBy: null,
      })
    })

    // Commit the batch
    await batch.commit()

    // Log the bulk action
    await addDoc(collection(db, "student_logs"), {
      action: "Bulk unblocked students",
      description: "Unbanned " + blockedStudents.length + " selected students.",
      studentCount: blockedStudents.length,
      studentIds: blockedStudents.map((s) => s.id),
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    closeBulkUnbanModal()
    clearSelection()
    showAlert(`${blockedStudents.length} blocked students unbanned successfully.`, "success")
    loadStudents() // Reload to reflect changes
  } catch (error) {
    console.error("Error unbanning students:", error)

    let errorMessage = "Error unbanning students."
    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    confirmBtn.disabled = false
    confirmBtn.innerHTML = "Unban Blocked Students"
  }
}

// Clear all filters
function clearFilters() {
  searchInput.value = ""
  sectionFilter.value = ""
  statusFilter.value = ""
  filterStudents()
}

// Export students to CSV
function exportStudents() {
  if (filteredStudents.length === 0) {
    showAlert("No students to export.", "warning")
    return
  }

  const headers = ["Name", "Email", "Student Number", "Section", "Registration Date", "Status"]
  const csvContent = [
    headers.join(","),
    ...filteredStudents.map((student) =>
      [
        `"${student.name || "Unknown"}"`,
        `"${student.email || "N/A"}"`,
        `"${student.studentNumber || "N/A"}"`,
        `"${student.className || "N/A"}"`,
        `"${student.createdAt ? new Date(student.createdAt.toDate()).toLocaleDateString() : "N/A"}"`,
        `"${student.status === "banned" ? "Banned" : student.status === "pending" ? "Pending" : "Active"}"`,
      ].join(","),
    ),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `students_${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  window.URL.revokeObjectURL(url)

  showAlert("Students exported successfully.", "success")
}

// Refresh students
function refreshStudents() {
  loadStudents()
  showAlert("Students refreshed.", "success")
}

// Modal close functions
function closeProfileModal() {
  profileModal.style.display = "none"
  currentStudent = null
}

function closeBanModal() {
  banModal.style.display = "none"
  currentStudent = null
  currentAction = null
}

function closeDeleteModal() {
  deleteModal.style.display = "none"
  currentStudent = null
}

// Make functions globally available
window.openProfileModal = openProfileModal
window.openBanModal = openBanModal
window.confirmBanAction = confirmBanAction
window.openDeleteModal = openDeleteModal
window.confirmDeleteStudent = confirmDeleteStudent
window.closeProfileModal = closeProfileModal
window.closeBanModal = closeBanModal
window.closeDeleteModal = closeDeleteModal
window.clearFilters = clearFilters
window.exportStudents = exportStudents
window.refreshStudents = refreshStudents
window.closeAlert = closeAlert

// Bulk operation functions
window.toggleSelectAll = toggleSelectAll
window.toggleStudentSelection = toggleStudentSelection
window.clearSelection = clearSelection
window.openBulkBanModal = openBulkBanModal
window.closeBulkBanModal = closeBulkBanModal
window.confirmBulkBan = confirmBulkBan
window.openBulkDeleteModal = openBulkDeleteModal
window.closeBulkDeleteModal = closeBulkDeleteModal
window.confirmBulkDelete = confirmBulkDelete
window.openBulkUnbanModal = openBulkUnbanModal
window.closeBulkUnbanModal = closeBulkUnbanModal
window.confirmBulkUnban = confirmBulkUnban
