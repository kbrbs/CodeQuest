// Class Management JavaScript
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.2.0/firebase-app.js"
import {
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/9.2.0/firebase-auth.js"
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  writeBatch,
  where,
} from "https://www.gstatic.com/firebasejs/9.2.0/firebase-firestore.js"

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-rXYqdJ5ujIxWNt4PjSJh4FtDyc3hieI",
  authDomain: "codequest-2025.firebaseapp.com",
  projectId: "codequest-2025",
  storageBucket: "codequest-2025.firebasestorage.app",
  messagingSenderId: "5857953993",
  appId: "1:5857953993:web:79cc6a52b3baf9b7b52518",
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// DOM Elements
const loadingElement = document.getElementById("loading")
const classesTable = document.getElementById("classes-table")
const classesTbody = document.getElementById("classes-tbody")
const searchInput = document.getElementById("search-input")
const selectAllCheckbox = document.getElementById("select-all")
const bulkActionsDiv = document.getElementById("bulk-actions")
const selectedCountSpan = document.getElementById("selected-count")

// Stats Elements
const totalClassesElement = document.getElementById("total-classes")
const totalStudentsElement = document.getElementById("total-students")
const activeClassesElement = document.getElementById("active-classes")

// Modal Elements
const viewStudentsModal = document.getElementById("view-students-modal")
const deleteModal = document.getElementById("delete-modal")
const bulkDeleteModal = document.getElementById("bulk-delete-modal")
const alertElement = document.getElementById("alert")

// Current class being edited or deleted
let currentClassId = null
let classes = []
let currentUser = null
let adminProfile = null
const selectedClasses = new Set()

// Check if user is authenticated
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user
      // Load admin profile first
      await loadAdminProfile()
      // User is signed in, load classes
      loadClasses()
      loadStats()
    } else {
      // User is not signed in, redirect to login page
      window.location.href = "../index.html"
    }
  })

  // Add search functionality
  searchInput.addEventListener("input", filterClasses)
})

// Load admin profile from Firestore
async function loadAdminProfile() {
  try {
    if (!currentUser) return

    // Try to get admin profile from 'admins' collection
    const adminDoc = await getDoc(doc(db, "admins", currentUser.uid))

    if (adminDoc.exists()) {
      adminProfile = adminDoc.data()
    } else {
      // If no admin profile, try 'users' collection
      const userDoc = await getDoc(doc(db, "users", currentUser.uid))
      if (userDoc.exists()) {
        adminProfile = userDoc.data()
      } else {
        // Create a basic profile with email
        adminProfile = {
          name: currentUser.displayName || currentUser.email.split("@")[0],
          email: currentUser.email,
        }
      }
    }
  } catch (error) {
    console.error("Error loading admin profile:", error)
    // Fallback profile
    adminProfile = {
      name: currentUser.displayName || currentUser.email.split("@")[0],
      email: currentUser.email,
    }
  }
}

// Helper to get admin name/email by UID
async function getAdminNameOrEmail(uid) {
  try {
    const adminDoc = await getDoc(doc(db, "admins", uid))
    if (adminDoc.exists()) {
      const data = adminDoc.data()
      return data.name || data.email || "Unknown"
    }
    // Optionally fallback to users collection
    const userDoc = await getDoc(doc(db, "users", uid))
    if (userDoc.exists()) {
      const data = userDoc.data()
      return data.name || data.email || "Unknown"
    }
    return "Unknown"
  } catch (e) {
    return "Unknown"
  }
}

// Load classes from Firestore and their student counts
async function loadClasses() {
  try {
    loadingElement.style.display = "block"
    classesTable.style.display = "none"

    // Query all classes
    const classesQuery = query(collection(db, "classes"))
    const classesSnapshot = await getDocs(classesQuery)

    // Clear existing rows
    classesTbody.innerHTML = ""
    classes = []
    selectedClasses.clear()
    updateBulkActions()

    if (classesSnapshot.empty) {
      // No classes found
      const noDataRow = document.createElement("tr")
      noDataRow.innerHTML = '<td colspan="7" style="text-align: center;">No classes found</td>'
      classesTbody.appendChild(noDataRow)
    } else {
      // Process each class and get student count and instructor name/email
      const classPromises = classesSnapshot.docs.map(async (docSnapshot) => {
        const classData = docSnapshot.data()
        classData.id = docSnapshot.id

        // Get student count for this class
        let studentCount = 0
        try {
          const studentsQuery = query(
            collection(db, "classes", docSnapshot.id, "students"),
            where("status", "==", "active"),
          )
          const studentsSnapshot = await getDocs(studentsQuery)
          studentCount = studentsSnapshot.size
        } catch (error) {
          console.error(`Error getting student count for class ${docSnapshot.id}:`, error)
        }
        classData._studentCount = studentCount // Only for display

        // Get instructor name/email using createdBy UID
        if (classData.createdBy) {
          classData.instructorName = await getAdminNameOrEmail(classData.createdBy)
        } else {
          classData.instructorName = "Unknown"
        }

        return classData
      })

      // Wait for all student counts and instructor names to be loaded
      const classesWithCounts = await Promise.all(classPromises)

      // Sort classes by creation date (newest first)
      classesWithCounts.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt.toDate() - a.createdAt.toDate()
        }
        return 0
      })

      // Add each class to the table
      classesWithCounts.forEach((classData) => {
        classes.push(classData)
        const classRow = createClassRow(classData)
        classesTbody.appendChild(classRow)
      })
    }

    // Hide loading and show table
    loadingElement.style.display = "none"
    classesTable.style.display = "table"
  } catch (error) {
    console.error("Error loading classes:", error)
    showAlert("Error loading classes. Please try again.", "error")
    loadingElement.style.display = "none"
  }
}

// Load statistics
async function loadStats() {
  try {
    // Get total classes
    const classesQuery = query(collection(db, "classes"))
    const classesSnapshot = await getDocs(classesQuery)
    totalClassesElement.textContent = classesSnapshot.size

    // Get active classes and total students
    let activeClasses = 0
    let totalStudents = 0

    // For each class, check if it has students
    for (const docSnapshot of classesSnapshot.docs) {
      try {
        const studentsQuery = query(
          collection(db, "classes", docSnapshot.id, "students"),
          where("status", "==", "active"),
        )
        const studentsSnapshot = await getDocs(studentsQuery)
        const studentCount = studentsSnapshot.size

        totalStudents += studentCount
        if (studentCount > 0) {
          activeClasses++
        }
      } catch (error) {
        console.error(`Error getting students for class ${docSnapshot.id}:`, error)
      }
    }

    activeClassesElement.textContent = activeClasses
    totalStudentsElement.textContent = totalStudents
  } catch (error) {
    console.error("Error loading stats:", error)
  }
}

// Create a table row for a class
function createClassRow(classData) {
  const row = document.createElement("tr")

  // Format date
  const createdAt = classData.createdAt ? new Date(classData.createdAt.toDate()).toLocaleDateString() : "N/A"

  // Student count with proper display (use _studentCount)
  const studentCount = classData._studentCount || 0
  const studentDisplay =
    studentCount === 0
      ? '<span class="badge badge-warning">0 Students</span>'
      : '<span class="badge badge-primary" >' + `${studentCount}` + ' students</span>'

  row.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="select-checkbox" value="${classData.id}" onchange="toggleClassSelection('${classData.id}')">
        </td>
        <td>${classData.className}</td>
        <td>${classData.instructorName}</td>
        <td><span class="class-code">${classData.classCode}</span></td>
        <td>${studentDisplay}</td>
        <td>${createdAt}</td>
        <td class="action-buttons">
            <button class="btn-icon view" title="View Students" onclick="openViewStudentsModal('${classData.id}')">
                <i class="fas fa-users"></i>
            </button>
            <button class="btn-icon delete" title="Delete Class" onclick="openDeleteModal('${classData.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `

  return row
}

// Toggle select all checkboxes
function toggleSelectAll() {
  const isChecked = selectAllCheckbox.checked
  const checkboxes = document.querySelectorAll(".select-checkbox")

  console.log(`Select all toggled: ${isChecked}. Found ${checkboxes.length} checkboxes`)
  selectedClasses.clear() // Clear first to avoid duplicates

  checkboxes.forEach((checkbox) => {
    checkbox.checked = isChecked
    if (isChecked) {
      selectedClasses.add(checkbox.value)
    } else {
      selectedClasses.delete(checkbox.value)
    }
  })

  updateBulkActions()
}

// Toggle individual class selection
function toggleClassSelection(classId) {
  const checkbox = document.querySelector(`.select-checkbox[value="${classId}"]`)

  if (!checkbox) {
    console.error(`Checkbox not found for class ${classId}`)
    return
  }

  if (checkbox.checked) {
    selectedClasses.add(classId)
  } else {
    selectedClasses.delete(classId)
  }

  // Update select all checkbox
  const allCheckboxes = document.querySelectorAll(".select-checkbox")
  const checkedCheckboxes = document.querySelectorAll(".select-checkbox:checked")

  if (checkedCheckboxes.length === 0) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = false
  } else if (checkedCheckboxes.length === allCheckboxes.length) {
    selectAllCheckbox.indeterminate = false
    selectAllCheckbox.checked = true
  } else {
    selectAllCheckbox.indeterminate = true
    selectAllCheckbox.checked = false
  }

  updateBulkActions()
}

// Update bulk actions visibility and count
function updateBulkActions() {
  const selectedCount = selectedClasses.size
  selectedCountSpan.textContent = `${selectedCount} selected`

  if (selectedCount > 0) {
    bulkActionsDiv.classList.add("show")
  } else {
    bulkActionsDiv.classList.remove("show")
  }
}

// Filter classes based on search input
function filterClasses() {
  const searchTerm = searchInput.value.toLowerCase()

  // Clear existing rows
  classesTbody.innerHTML = ""

  // Filter classes
  const filteredClasses = classes.filter(
    (classData) =>
      classData.className.toLowerCase().includes(searchTerm) ||
      classData.instructorName.toLowerCase().includes(searchTerm) ||
      classData.classCode.toLowerCase().includes(searchTerm),
  )

  if (filteredClasses.length === 0) {
    // No matching classes
    const noDataRow = document.createElement("tr")
    noDataRow.innerHTML = '<td colspan="7" style="text-align: center;">No matching classes found</td>'
    classesTbody.appendChild(noDataRow)
  } else {
    // Add filtered classes to the table
    filteredClasses.forEach((classData) => {
      const classRow = createClassRow(classData)
      classesTbody.appendChild(classRow)
    })
  }

  // Reset selections when filtering
  selectedClasses.clear()
  selectAllCheckbox.checked = false
  selectAllCheckbox.indeterminate = false
  updateBulkActions()
}

// Open View Students Modal
async function openViewStudentsModal(classId) {
  try {
    currentClassId = classId

    // Show loading
    document.getElementById("students-loading").style.display = "block"
    document.getElementById("students-container").style.display = "none"

    // Get class data
    const classDoc = await getDoc(doc(db, "classes", classId))

    if (classDoc.exists()) {
      const classData = classDoc.data()

      // Set class details
      document.getElementById("view-class-name").textContent = classData.className
      document.getElementById("view-class-code").textContent = classData.classCode

      // Get students
      const studentsQuery = query(
        collection(db, "classes", classId, "students"),
        where("status", "==", "active")
      )
      const studentsSnapshot = await getDocs(studentsQuery)
      const studentList = document.getElementById("student-list")

      // Clear existing students
      studentList.innerHTML = ""

      // Set student count
      document.getElementById("student-count").textContent = studentsSnapshot.size

      if (studentsSnapshot.empty) {
        // No students
        studentList.innerHTML = '<li class="no-students">No students enrolled in this class yet.</li>'
      } else {
        // Add each student to the list
        studentsSnapshot.forEach((docSnapshot) => {
          const student = docSnapshot.data()
          const studentItem = createStudentItem(student)
          studentList.appendChild(studentItem)
        })
      }

      // Hide loading and show students
      document.getElementById("students-loading").style.display = "none"
      document.getElementById("students-container").style.display = "block"

      // Show modal
      viewStudentsModal.style.display = "block"
    } else {
      showAlert("Class not found.", "error")
    }
  } catch (error) {
    console.error("Error opening view students modal:", error)
    showAlert("Error loading students.", "error")
  }
}

// Create student item for the list
function createStudentItem(student) {
  const li = document.createElement("li")
  li.className = "student-item"

  // Get initials for avatar
  const initials = student.name
    ? student.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
    : "S"

  li.innerHTML = `
        <div class="student-avatar">${initials}</div>
        <div class="student-info">
            <div class="student-name">${student.name || "Unknown Student"}</div>
            <div class="student-email">${student.email || "No email"}</div>
            <div class="student-progress">Joined: ${student.createdAt ? new Date(student.createdAt.toDate()).toLocaleDateString() : "Unknown"}</div>
        </div>
    `

  return li
}

// Close View Students Modal
function closeViewStudentsModal() {
  viewStudentsModal.style.display = "none"
  currentClassId = null
}

// Copy class code to clipboard
function copyClassCode() {
  const codeElement = document.getElementById("view-class-code")
  const code = codeElement.textContent

  navigator.clipboard
    .writeText(code)
    .then(() => {
      showAlert("Class code copied to clipboard!", "success")
    })
    .catch((err) => {
      console.error("Could not copy text: ", err)
      showAlert("Could not copy class code.", "error")
    })
}

// Open Delete Modal
async function openDeleteModal(classId) {
  try {
    currentClassId = classId

    // Get class data
    const classDoc = await getDoc(doc(db, "classes", classId))

    if (classDoc.exists()) {
      const classData = classDoc.data()

      // Set class name
      document.getElementById("delete-class-name").textContent = classData.className
      document.getElementById("delete-admin-password").value = ""

      // Show modal
      deleteModal.style.display = "block"
    } else {
      showAlert("Class not found.", "error")
    }
  } catch (error) {
    console.error("Error opening delete modal:", error)
    showAlert("Error loading class details.", "error")
  }
}

// Close Delete Modal
function closeDeleteModal() {
  deleteModal.style.display = "none"
  currentClassId = null
}

// Open Bulk Delete Modal
function openBulkDeleteModal() {
  if (selectedClasses.size === 0) {
    showAlert("Please select classes to delete.", "warning")
    return
  }

  // Set count
  document.getElementById("bulk-delete-count").textContent = selectedClasses.size

  // Clear password
  document.getElementById("bulk-delete-admin-password").value = ""

  // Populate list of classes to be deleted
  const bulkDeleteList = document.getElementById("bulk-delete-list")
  bulkDeleteList.innerHTML = ""

  selectedClasses.forEach((classId) => {
    const classData = classes.find((c) => c.id === classId)
    if (classData) {
      const item = document.createElement("div")
      item.className = "bulk-delete-item"
      item.innerHTML = `
                <strong>${classData.className}</strong> (${classData.classCode}) - 
                <span class="text-muted">${classData._studentCount || 0} students</span>
            `
      bulkDeleteList.appendChild(item)
    }
  })

  // Show modal
  bulkDeleteModal.style.display = "block"
}

// Close Bulk Delete Modal
function closeBulkDeleteModal() {
  bulkDeleteModal.style.display = "none"
}

// Delete single class
async function deleteClass() {
  if (!currentClassId) return

  const adminPassword = document.getElementById("delete-admin-password").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  // Disable button to prevent multiple submissions
  const deleteButton = document.getElementById("delete-class-btn")
  deleteButton.disabled = true
  deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'


  try {
    // Re-authenticate current user to verify password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    // Get class data for logging
    const classDoc = await getDoc(doc(db, "classes", currentClassId))
    const classData = classDoc.data()

    // Delete all students in the class
    const studentsQuery = query(collection(db, "classes", currentClassId, "students"))
    const studentsSnapshot = await getDocs(studentsQuery)

    // Batch delete students
    const batchDelete = writeBatch(db)
    studentsSnapshot.forEach((docSnapshot) => {
      batchDelete.delete(docSnapshot.ref)
    })

    // Delete the class
    batchDelete.delete(doc(db, "classes", currentClassId))

    // Commit the batch
    await batchDelete.commit()

    // Log the action
    await addDoc(collection(db, "activity_logs"), {
      action: "Delete class",
      description: classData.classCode + " deleted by Super Admin.",
      className: classData.className,
      classCode: classData.classCode,
      performedBy: currentUser.uid,
      performedByEmail: currentUser.email,
      timestamp: serverTimestamp(),
    })

    // Close modal and reload classes
    closeDeleteModal()
    showAlert("Class deleted successfully.", "success")
    loadClasses()
    loadStats()
  } catch (error) {
    console.error("Error deleting class:", error)

    let errorMessage = "Error deleting class."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    deleteButton.disabled = false
    deleteButton.innerHTML = "Delete Class"
  }
}

// Bulk delete classes
async function bulkDeleteClasses() {
  if (selectedClasses.size === 0) {
    showAlert("No classes selected.", "error")
    return
  }

  let size = selectedClasses.size

  const adminPassword = document.getElementById("bulk-delete-admin-password").value

  if (!adminPassword) {
    showAlert("Please enter your password for verification.", "error")
    return
  }

  // Disable button to prevent multiple submissions
  const bulkDeleteButton = document.getElementById("bulk-delete-btn")
  bulkDeleteButton.disabled = true
  bulkDeleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...'


  try {
    // Re-authenticate current user to verify password
    const credential = EmailAuthProvider.credential(currentUser.email, adminPassword)

    await reauthenticateWithCredential(currentUser, credential)

    const deletedClasses = []
    let totalDeleted = 0

    // Process each selected class individually to avoid batch size limits
    for (const classId of Array.from(selectedClasses)) {
      try {
        // Get class data for logging
        const classDoc = await getDoc(doc(db, "classes", classId))
        if (!classDoc.exists()) {
          continue
        }
        const classData = classDoc.data()
        // Create a new batch for each class to avoid size limits
        const classBatch = writeBatch(db)
        // Delete all students in this class
        const studentsQuery = query(collection(db, "classes", classId, "students"))
        const studentsSnapshot = await getDocs(studentsQuery)
        // Add student deletions to batch
        studentsSnapshot.forEach((studentDoc) => {
          classBatch.delete(studentDoc.ref)
        })
        // Add class deletion to batch
        classBatch.delete(doc(db, "classes", classId))
        // Commit this class's batch
        await classBatch.commit()
        deletedClasses.push({
          id: classId,
          name: classData.className,
          code: classData.classCode,
          studentsDeleted: studentsSnapshot.size,
        })
        totalDeleted++
      } catch (error) {
        console.error(`Error processing class ${classId}:`, error)
        showAlert(`Error deleting class ${classId}. Some classes may not have been deleted.`, "warning")
      }
    }

    // Log the bulk action only if we successfully deleted classes
    if (deletedClasses.length > 0) {
      try {
        await addDoc(collection(db, "activity_logs"), {
          action: "Bulk delete classes",
          description: `Deleted ${deletedClasses.length} classes by Super Admin`,
          classCount: deletedClasses.length,
          deletedClasses: deletedClasses,
          performedBy: currentUser.uid,
          performedByEmail: currentUser.email,
          timestamp: serverTimestamp(),
        })
      } catch (logError) {
        console.error("Error logging bulk delete action:", logError)
      }
    }

    // Close modal and reload classes
    closeBulkDeleteModal()
    if (totalDeleted === size) {
      showAlert(`Successfully deleted ${totalDeleted} classes.`, "success")
    } else if (totalDeleted > 0) {
      showAlert(`Deleted ${totalDeleted} out of ${size} selected classes.`, "warning")
    } else {
      showAlert("No classes were deleted. Please try again.", "error")
    }

    // Clear selections
    selectedClasses.clear()
    selectAllCheckbox.checked = false
    selectAllCheckbox.indeterminate = false
    updateBulkActions()

    // Reload data
    await loadClasses()
    await loadStats()
  } catch (error) {
    console.error("Error bulk deleting classes:", error)

    let errorMessage = "Error deleting classes."

    if (error.code === "auth/wrong-password") {
      errorMessage = "Incorrect password."
    } else if (error.code === "auth/too-many-requests") {
      errorMessage = "Too many attempts. Please try again later."
    }

    showAlert(errorMessage, "error")
  } finally {
    // Re-enable button
    bulkDeleteButton.disabled = false
    bulkDeleteButton.innerHTML = "Delete All Selected"
  }
}

// Show alert message
function showAlert(message, type) {
  const alertElement = document.getElementById("alert")
  const alertMessage = document.getElementById("alert-message")

  alertElement.className = "alert " + type
  alertMessage.textContent = message
  alertElement.style.display = "flex"

  // Auto-hide after 5 seconds
  setTimeout(() => {
    closeAlert()
  }, 5000)
}

// Close alert
function closeAlert() {
  const alertElement = document.getElementById("alert")
  alertElement.classList.add("hiding")

  setTimeout(() => {
    alertElement.style.display = "none"
    alertElement.classList.remove("hiding")
  }, 300)
}

// Make functions globally available
window.openViewStudentsModal = openViewStudentsModal
window.closeViewStudentsModal = closeViewStudentsModal
window.copyClassCode = copyClassCode
window.openDeleteModal = openDeleteModal
window.closeDeleteModal = closeDeleteModal
window.deleteClass = deleteClass
window.openBulkDeleteModal = openBulkDeleteModal
window.closeBulkDeleteModal = closeBulkDeleteModal
window.bulkDeleteClasses = bulkDeleteClasses
window.toggleSelectAll = toggleSelectAll
window.toggleClassSelection = toggleClassSelection
window.closeAlert = closeAlert

// Ensure DOM is loaded before attaching functions
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachGlobalFunctions)
  } else {
    attachGlobalFunctions()
  }
}

function attachGlobalFunctions() {
  window.openViewStudentsModal = openViewStudentsModal
  window.closeViewStudentsModal = closeViewStudentsModal
  window.copyClassCode = copyClassCode
  window.openDeleteModal = openDeleteModal
  window.closeDeleteModal = closeDeleteModal
  window.deleteClass = deleteClass
  window.openBulkDeleteModal = openBulkDeleteModal
  window.closeBulkDeleteModal = closeBulkDeleteModal
  window.bulkDeleteClasses = bulkDeleteClasses
  window.toggleSelectAll = toggleSelectAll
  window.toggleClassSelection = toggleClassSelection
  window.closeAlert = closeAlert
}
