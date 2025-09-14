import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"

// Wait for Firebase to be initialized
let db
const initFirebase = () => {
  if (window.firebase && window.firebase.db) {
    db = window.firebase.db
    return true
  }
  return false
}

class DashboardManager {
  constructor() {
    this.weeklyData = {
      students: 0,
      admins: 0,
      classes: 0,
      content: 0,
    }
    this.allActivities = []
    this.filteredActivities = []
    this.sortColumn = 'timestamp'
    this.sortDirection = 'desc'
    this.initializeDashboard()
  }

  async initializeDashboard() {
    // Wait for Firebase to be ready
    const checkFirebase = setInterval(() => {
      if (initFirebase()) {
        clearInterval(checkFirebase)
        this.loadDashboardData()
      }
    }, 100)
  }

  async loadDashboardData() {
    try {
      await Promise.all([this.loadMetrics(), this.loadRecentActivities()])
    } catch (error) {
      console.error("Error initializing dashboard:", error)
    }
  }

  async loadMetrics() {
    try {
      const [totalStudents, totalAdmins, totalClasses, totalContent, activeToday] = await Promise.all([
        this.getTotalStudents(),
        this.getTotalAdmins(),
        this.getTotalClasses(),
        this.getTotalContent(),
      ])

      this.updateMetricsUI({
        totalStudents,
        totalAdmins,
        totalClasses,
        totalContent,
      })
    } catch (error) {
      console.error("Error loading metrics:", error)
      this.showMetricsError()
    }
  }

  async getTotalStudents() {
    try {
      const classesSnapshot = await getDocs(collection(db, "classes"))
      let totalStudents = 0

      for (const classDoc of classesSnapshot.docs) {
        // Only count students where status == "active"
        const studentsQuery = query(
          collection(classDoc.ref, "students"),
          where("status", "==", "active")
        )
        const studentsSnapshot = await getDocs(studentsQuery)
        totalStudents += studentsSnapshot.size
      }

      return totalStudents
    } catch (error) {
      console.error("Error getting total students:", error)
      return 0
    }
  }

  async getTotalAdmins() {
    try {
      const q = query(collection(db, "admins"), where("isActive", "==", true))
      const snapshot = await getDocs(q)
      return snapshot.size
    } catch (error) {
      console.error("Error getting total admins:", error)
      return 0
    }
  }

  async getTotalClasses() {
    try {
      const q = query(collection(db, "classes"), where("isActive", "==", true))
      const snapshot = await getDocs(q)
      return snapshot.size
    } catch (error) {
      console.error("Error getting total classes:", error)
      return 0
    }
  }

  async getTotalContent() {
    try {
      // This would depend on your content structure
      // For now, returning 0 as the structure isn't specified
      return 0
    } catch (error) {
      console.error("Error getting total content:", error)
      return 0
    }
  }

  updateMetricsUI(metrics) {
    document.getElementById("total-students").textContent = metrics.totalStudents.toLocaleString()
    document.getElementById("total-admins").textContent = metrics.totalAdmins.toLocaleString()
    document.getElementById("total-classes").textContent = metrics.totalClasses.toLocaleString()
    document.getElementById("total-content").textContent = metrics.totalContent.toLocaleString()

    // Update change indicators
    document.getElementById("students-change").textContent = "Updated now"
    document.getElementById("admins-change").textContent = "Updated now"
    document.getElementById("classes-change").textContent = "Updated now"
    document.getElementById("content-change").textContent = "Updated now"
  }

  showMetricsError() {
    const errorText = "Error loading"
    document.getElementById("total-students").textContent = errorText
    document.getElementById("total-admins").textContent = errorText
    document.getElementById("total-classes").textContent = errorText
    document.getElementById("total-content").textContent = errorText
  }

  async loadRecentActivities() {
    try {
      const activities = await this.getRecentActivities()
      this.updateActivitiesUI(activities)
    } catch (error) {
      console.error("Error loading activities:", error)
      document.getElementById("activities-loading").innerHTML =
        '<i class="fas fa-exclamation-triangle"></i><p>Error loading activities</p>'
    }
  }

  // Add this helper to fetch user info by UID with caching
  async getUserInfoMap(uids) {
    if (!this.userInfoCache) this.userInfoCache = {}

    // Only fetch UIDs not already cached
    const uncachedUids = uids.filter(uid => !this.userInfoCache[uid])
    if (uncachedUids.length === 0) return this.userInfoCache

    // Fetch from admins
    const adminSnap = await getDocs(collection(db, "admins"))
    adminSnap.forEach(doc => {
      const data = doc.data()
      if (uncachedUids.includes(doc.id)) {
        this.userInfoCache[doc.id] = {
          name: data.name || "",
          email: data.email || "",
          type: "admin"
        }
      }
    })

    // Fetch students from each class's students subcollection
    const classesSnap = await getDocs(collection(db, "classes"))
    for (const classDoc of classesSnap.docs) {
      const studentsColRef = collection(classDoc.ref, "students")
      const studentsSnap = await getDocs(studentsColRef)
      studentsSnap.forEach(studentDoc => {
        const data = studentDoc.data()
        if (uncachedUids.includes(studentDoc.id)) {
          this.userInfoCache[studentDoc.id] = {
            name: data.name || "",
            email: data.email || "",
            type: "student"
          }
        }
      })
    }

    // For any UID not found, mark as unknown
    uncachedUids.forEach(uid => {
      if (!this.userInfoCache[uid]) {
        this.userInfoCache[uid] = { name: "", email: "", type: "unknown" }
      }
    })

    return this.userInfoCache
  }

  async getAllActivities() {
    try {
      const [activitySnap, adminSnap, systemSnap] = await Promise.all([
        getDocs(collection(db, "activity_logs")),
        getDocs(collection(db, "admin_logs")),
        getDocs(collection(db, "student_logs")),
      ])

      const allLogs = [
        ...activitySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "activity_logs" })),
        ...adminSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "admin_logs" })),
        ...systemSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "student_logs" }))
      ]

      // Sort by timestamp descending
      const sorted = allLogs
        .filter(log => log.timestamp)
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())

      // Collect all unique performedBy UIDs
      const uids = [...new Set(sorted.map(log => log.performedBy).filter(Boolean))]
      await this.getUserInfoMap(uids)

      // Attach user info to each activity
      sorted.forEach(log => {
        const user = this.userInfoCache[log.performedBy] || {}
        log.displayName = user.name || user.email || "Unknown"
        log.displayEmail = user.email || "Unknown"
      })

      this.allActivities = sorted
      this.filteredActivities = [...sorted]
      return sorted
    } catch (error) {
      console.error("Error getting all activities:", error)
      return []
    }
  }

  async getRecentActivities() {
    try {
      const [activitySnap, adminSnap, systemSnap] = await Promise.all([
        getDocs(collection(db, "activity_logs")),
        getDocs(collection(db, "admin_logs")),
        getDocs(collection(db, "student_logs")),
      ])

      const allLogs = [
        ...activitySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "activity_logs" })),
        ...adminSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "admin_logs" })),
        ...systemSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), source: "student_logs" }))
      ]

      // Sort by timestamp descending
      const sorted = allLogs
        .filter(log => log.timestamp)
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())

      // Limit to 10 recent activities for dashboard
      const recent = sorted.slice(0, 10)

      // Collect all unique performedBy UIDs
      const uids = [...new Set(recent.map(log => log.performedBy).filter(Boolean))]
      await this.getUserInfoMap(uids)

      // Attach user info to each activity
      recent.forEach(log => {
        const user = this.userInfoCache[log.performedBy] || {}
        log.displayName = user.name || user.email || "User"
        log.displayEmail = user.email || "Unknown"
      })

      return recent
    } catch (error) {
      console.error("Error getting recent activities:", error)
      return []
    }
  }

  updateActivitiesUI(activities) {
    const loadingElement = document.getElementById("activities-loading")
    const tableElement = document.getElementById("activities-table")
    const tbody = document.getElementById("activities-tbody")

    loadingElement.style.display = "none"
    tableElement.style.display = "table"
    tbody.innerHTML = ""

    if (activities.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align: center; color: #666;">No recent activities found</td></tr>'
      return
    }

    activities.forEach((activity) => {
      const row = document.createElement("tr")
      row.innerHTML = `
      <td>${this.formatTimestamp(activity.timestamp)}</td>
      <td><span class="activity-action ${activity.action}">${activity.action}</span></td>
      <td>${activity.displayName}</td>
      <td>${activity.description || "No description"}</td>
    `
      tbody.appendChild(row)
    })
  }

  updateModalActivitiesUI(activities) {
    const loadingElement = document.getElementById("modal-loading")
    const tableElement = document.getElementById("modal-activities-table")
    const tbody = document.getElementById("modal-activities-tbody")
    const resultsCount = document.getElementById("resultsCount")

    loadingElement.style.display = "none"
    tableElement.style.display = "table"
    tbody.innerHTML = ""

    resultsCount.textContent = `Showing ${activities.length} activities`

    if (activities.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="no-results">No activities found matching your criteria</td></tr>'
      return
    }

    activities.forEach((activity) => {
      const row = document.createElement("tr")
      row.innerHTML = `
        <td>${this.formatTimestamp(activity.timestamp)}</td>
        <td><span class="activity-action ${activity.action}">${activity.action}</span></td>
        <td>${activity.displayName}</td>
        <td>${activity.description || "No description"}</td>
      `
      tbody.appendChild(row)
    })
  }

  populateActionFilter() {
    const filterSelect = document.getElementById("filterAction")
    const actions = [...new Set(this.allActivities.map(activity => activity.action))].sort()
    
    // Clear existing options except "All Actions"
    filterSelect.innerHTML = '<option value="">All Actions</option>'
    
    actions.forEach(action => {
      if (action) {
        const option = document.createElement("option")
        option.value = action
        option.textContent = action
        filterSelect.appendChild(option)
      }
    })
  }

  filterActivities() {
    const searchGeneral = document.getElementById("searchGeneral").value.toLowerCase()
    const searchDate = document.getElementById("searchDate").value
    const filterAction = document.getElementById("filterAction").value

    this.filteredActivities = this.allActivities.filter(activity => {
      // General search across all fields
      const generalMatch = !searchGeneral || 
        (activity.action && activity.action.toLowerCase().includes(searchGeneral)) ||
        (activity.email && activity.email.toLowerCase().includes(searchGeneral)) ||
        (activity.adminEmail && activity.adminEmail.toLowerCase().includes(searchGeneral)) ||
        (activity.performedByEmail && activity.performedByEmail.toLowerCase().includes(searchGeneral)) ||
        (activity.description && activity.description.toLowerCase().includes(searchGeneral))

      // Date filter
      const dateMatch = !searchDate || 
        (activity.timestamp && activity.timestamp.toDate().toDateString() === new Date(searchDate).toDateString())

      // Action filter
      const actionMatch = !filterAction || activity.action === filterAction

      return generalMatch && dateMatch && actionMatch
    })

    this.sortActivities()
    this.updateModalActivitiesUI(this.filteredActivities)
  }

  sortActivities() {
    this.filteredActivities.sort((a, b) => {
      let aValue, bValue

      switch (this.sortColumn) {
        case 'timestamp':
          aValue = a.timestamp ? a.timestamp.toMillis() : 0
          bValue = b.timestamp ? b.timestamp.toMillis() : 0
          break
        case 'action':
          aValue = (a.action || '').toLowerCase()
          bValue = (b.action || '').toLowerCase()
          break
        case 'user':
          aValue = (a.email || a.adminEmail || a.performedByEmail || '').toLowerCase()
          bValue = (b.email || b.adminEmail || b.performedByEmail || '').toLowerCase()
          break
        case 'description':
          aValue = (a.description || '').toLowerCase()
          bValue = (b.description || '').toLowerCase()
          break
        default:
          return 0
      }

      if (this.sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
      }
    })
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown"

    let date
    if (timestamp.toDate) {
      // Firestore Timestamp
      date = timestamp.toDate()
    } else if (timestamp instanceof Date) {
      date = timestamp
    } else {
      date = new Date(timestamp)
    }

    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`

    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    )
  }
}

// Global functions for modal functionality
window.seeAll = async () => {
  const modal = document.getElementById("activitiesModal")
  const loadingElement = document.getElementById("modal-loading")
  const tableElement = document.getElementById("modal-activities-table")
  
  modal.style.display = "block"
  loadingElement.style.display = "block"
  tableElement.style.display = "none"
  
  try {
    await window.dashboardManager.getAllActivities()
    window.dashboardManager.populateActionFilter()
    window.dashboardManager.updateModalActivitiesUI(window.dashboardManager.filteredActivities)
    
    // Setup event listeners for search and filter
    document.getElementById("searchGeneral").addEventListener("input", () => {
      window.dashboardManager.filterActivities()
    })
    
    document.getElementById("searchDate").addEventListener("change", () => {
      window.dashboardManager.filterActivities()
    })
    
    document.getElementById("filterAction").addEventListener("change", () => {
      window.dashboardManager.filterActivities()
    })
    
  } catch (error) {
    console.error("Error loading all activities:", error)
    loadingElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i><p>Error loading activities</p>'
  }
}

window.closeActivitiesModal = () => {
  document.getElementById("activitiesModal").style.display = "none"
}

window.sortTable = (column) => {
  const dashboardManager = window.dashboardManager
  
  if (dashboardManager.sortColumn === column) {
    dashboardManager.sortDirection = dashboardManager.sortDirection === 'asc' ? 'desc' : 'asc'
  } else {
    dashboardManager.sortColumn = column
    dashboardManager.sortDirection = 'desc'
  }
  
  // Update sort icons
  document.querySelectorAll('.modal-table th').forEach(th => {
    th.classList.remove('sorted')
    const icon = th.querySelector('.sort-icon')
    if (icon) {
      icon.className = 'fas fa-sort sort-icon'
    }
  })
  
  const currentTh = document.querySelector(`[onclick="sortTable('${column}')"]`)
  if (currentTh) {
    currentTh.classList.add('sorted')
    const icon = currentTh.querySelector('.sort-icon')
    if (icon) {
      icon.className = `fas fa-sort-${dashboardManager.sortDirection === 'asc' ? 'up' : 'down'} sort-icon`
    }
  }
  
  dashboardManager.sortActivities()
  dashboardManager.updateModalActivitiesUI(dashboardManager.filteredActivities)
}

window.clearFilters = () => {
  document.getElementById("searchGeneral").value = ""
  document.getElementById("searchDate").value = ""
  document.getElementById("filterAction").value = ""
  
  window.dashboardManager.filteredActivities = [...window.dashboardManager.allActivities]
  window.dashboardManager.sortActivities()
  window.dashboardManager.updateModalActivitiesUI(window.dashboardManager.filteredActivities)
}

// Close modal when clicking outside of it
window.onclick = (event) => {
  const modal = document.getElementById("activitiesModal")
  if (event.target === modal) {
    modal.style.display = "none"
  }
}

// Action button functions
window.addAdmin = () => {
  window.location.href = 'admin-management.html';
}

window.createClass = () => {
  window.location.href = 'class-management.html';
}

window.addContent = () => {
  window.location.href = 'content-management.html';
}

window.exportReports = () => {
  // Implement report generation and download
}

window.systemSettings = () => {
  window.location.href = '#';
}

// Initialize dashboard when page loads
document.addEventListener("DOMContentLoaded", () => {
  window.dashboardManager = new DashboardManager()
})

// Auto-refresh data every 5 minutes
setInterval(
  () => {
    window.dashboardManager = new DashboardManager()
  },
  5 * 60 * 1000,
)