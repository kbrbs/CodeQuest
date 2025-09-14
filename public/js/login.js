// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.2.0/firebase-app.js"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.2.0/firebase-auth.js"
import {
  getFirestore,
  collection,
  query,
  where,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
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

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app)

// Initialize Firestore
const db = getFirestore(app)

// DOM elements
const loginForm = document.getElementById("login-form")
const emailInput = document.getElementById("email")
const passwordInput = document.getElementById("password")
const forgotPasswordLink = document.getElementById("forgot-password")
const errorMessage = document.getElementById("error-message")

// Password change modal elements
const passwordChangeModal = document.getElementById("password-change-modal")
const passwordChangeForm = document.getElementById("password-change-form")
const newPasswordInput = document.getElementById("new-password")
const confirmPasswordInput = document.getElementById("confirm-password")
const passwordErrorMessage = document.getElementById("password-error-message")

// Global variable to store first login data
let firstLoginData = null
let isDuringFirstLoginSetup = false;

// Login form submission
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const email = emailInput.value.trim()
  const password = passwordInput.value.trim()

  errorMessage.textContent = ""

  try {
    // Show loading state
    document.querySelector(".login-btn").textContent = "LOGGING IN..."
    document.querySelector(".login-btn").disabled = true

    // Use handleLogin function to handle both first login and regular login
    const result = await handleLogin(email, password)

    if (result.success) {
      if (result.isFirstLogin) {
        console.log("First login detected - showing password change modal")
        // Show password change modal for first login
        showPasswordChangeModal(result.email, result.adminData, result.pendingAdminDoc)
      } else {
        console.log("Regular login - user logged in:", result.user.uid)
        // Check user role from Firestore for regular login
        checkUserRole(result.user.uid)
      }
    }
  } catch (error) {
    console.error("Login error:", error)

    // Handle specific error codes
    switch (error.code) {
      case "auth/timeout":
        errorMessage.textContent = "Please check your internet connection."
        break
      case "auth/user-not-found":
        errorMessage.textContent = "No account found with this email."
        break
      case "auth/wrong-password":
        errorMessage.textContent = "Incorrect password."
        break
      case "auth/invalid-email":
        errorMessage.textContent = "Invalid email format."
        break
      case "auth/invalid-login-credentials":
        errorMessage.textContent = "Invalid login credentials. Check your email and password."
        break
      case "auth/too-many-requests":
        errorMessage.textContent = "Too many failed login attempts. Try again later."
        break
      case "auth/email-already-in-use":
        errorMessage.textContent = "An account with this email already exists."
        break
      case "auth/weak-password":
        errorMessage.textContent = "Password is too weak."
        break
      case "invalid-credentials":
        errorMessage.textContent = "Invalid email or password."
        break
      case "admin-not-found":
        errorMessage.textContent = "No admin account found with this email."
        break
      case "admin-blocked":
        errorMessage.textContent = "Your admin account has been blocked. Contact the Super Admin."
        break
      default:
        errorMessage.textContent = error.message || "Login failed. Please try again."
    }

    // Reset button
    document.querySelector(".login-btn").textContent = "LOGIN"
    document.querySelector(".login-btn").disabled = false
  }
})

// Handle login - supports both first login and regular login

async function handleLogin(email, password) {
  try {
    console.log("Starting login process for:", email);

    // Step 1: Check for pending admin (first login)
    let emailDocId = email.replace(/[.#$[\]]/g, "_");
    let pendingAdminRef = doc(db, "admins", emailDocId);
    let pendingAdminDoc = await getDoc(pendingAdminRef);

    if (!pendingAdminDoc.exists()) {
      emailDocId = email.replace(".com", "_com");
      pendingAdminRef = doc(db, "admins", emailDocId);
      pendingAdminDoc = await getDoc(pendingAdminRef);
    }

    if (pendingAdminDoc.exists()) {
      const adminData = pendingAdminDoc.data();
      if (adminData.firstLogin) {
        return await validateFirstLogin(email, password, pendingAdminDoc);
      }
    }

    // Step 2: Regular login
    console.log("Attempting regular login");
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const loggedInUser = userCredential.user;
    console.log("Regular login successful:", loggedInUser.uid);

    // 🔹 Step 3: Sync Firestore email immediately
    try {
      const adminRef = doc(db, "admins", loggedInUser.uid);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        const firestoreEmail = adminSnap.data().email;
        if (firestoreEmail !== loggedInUser.email) {
          await updateDoc(adminRef, { email: loggedInUser.email });
          console.log(`[sync] Updated Firestore email: ${firestoreEmail} -> ${loggedInUser.email}`);
        } else {
          console.log("[sync] Firestore email matches Auth email");
        }
      } else {
        console.warn("[sync] No admin doc found for UID:", loggedInUser.uid);
      }
    } catch (syncError) {
      console.error("[sync] Failed to update Firestore email:", syncError);
    }

    return { success: true, user: loggedInUser, isFirstLogin: false };

  } catch (error) {
    console.error("Error during login:", error);
    throw error;
  }
}

// Validate first login credentials without creating auth account
async function validateFirstLogin(email, password, pendingAdminDoc) {
  try {
    console.log("Validating first login credentials")

    const adminData = pendingAdminDoc.data()

    // Step 1: Check if admin account is active
    if (!adminData.isActive) {
      const error = new Error("Your admin account has been blocked. Contact the Super Admin.")
      error.code = "admin-blocked"
      throw error
    }

    // Step 2: Verify the temporary password
    if (password !== adminData.tempPassword) {
      const error = new Error("Invalid credentials")
      error.code = "invalid-credentials"
      throw error
    }

    console.log("First login credentials validated successfully")

    return {
      success: true,
      isFirstLogin: true,
      email: email,
      adminData: adminData,
      pendingAdminDoc: pendingAdminDoc,
    }
  } catch (error) {
    console.error("Error during first login validation:", error)
    throw error
  }
}

// Show password change modal
function showPasswordChangeModal(email, adminData, pendingAdminDoc) {
  passwordChangeModal.classList.add("show")

  // Store data for password change modal
  firstLoginData = {
    email: email,
    adminData: adminData,
    pendingAdminDoc: pendingAdminDoc,
  }

  // Reset form
  passwordChangeForm.reset()
  passwordErrorMessage.textContent = ""

  // Focus on new password input
  setTimeout(() => {
    newPasswordInput.focus()
  }, 300)
}

// Password change form submission
passwordChangeForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const newPassword = newPasswordInput.value.trim()
  const confirmPassword = confirmPasswordInput.value.trim()

  passwordErrorMessage.textContent = ""

  // Validate passwords
  if (newPassword.length < 8) {
    passwordErrorMessage.textContent = "Password must be at least 8 characters long."
    return
  }

  if (newPassword !== confirmPassword) {
    passwordErrorMessage.textContent = "Passwords do not match."
    return
  }

  // Check password strength
  if (!isPasswordStrong(newPassword)) {
    passwordErrorMessage.textContent =
      "Password must contain at least one uppercase letter, one lowercase letter, and one number."
    return
  }

  try {
    // Show loading state
    const changeBtn = document.querySelector(".change-password-btn")
    changeBtn.textContent = "CREATING ACCOUNT..."
    changeBtn.disabled = true

    await completeFirstLoginSetup(newPassword)
  } catch (error) {
    console.error("Error completing first login setup:", error)
    passwordErrorMessage.textContent = error.message || "Failed to create account. Please try again."

    // Reset button
    const changeBtn = document.querySelector(".change-password-btn")
    changeBtn.textContent = "Change Password"
    changeBtn.disabled = false
  }
})

// Complete first login setup - CREATE auth account with new password
async function completeFirstLoginSetup(newPassword) {
  try {
    isDuringFirstLoginSetup = true;
    const { email, adminData, pendingAdminDoc } = firstLoginData

    console.log("Creating Firebase Auth account with new password")

    // Step 1: Create Firebase Auth account with the NEW password
    const userCredential = await createUserWithEmailAndPassword(auth, email, newPassword)
    const newUser = userCredential.user

    console.log("Firebase Auth account created successfully:", newUser.uid)

    try {
      // Step 1: Sanitize email-based ID
      let emailDocId = email.replace(/[.#$[\]]/g, "_");
      const oldDocRef = doc(db, "admins", emailDocId);
      const newDocRef = doc(db, "admins", newUser.uid);

      // Step 2: Get data from old document
      const snapshot = await getDoc(oldDocRef);

      if (snapshot.exists()) {
        const adminData = snapshot.data();

        // Step 3: Prepare new admin data
        const newAdminData = {
          ...adminData,
          firstLogin: false,
          authAccountCreated: true,
          authAccountCreatedAt: serverTimestamp(),
          uid: newUser.uid,
          passwordChangedAt: serverTimestamp()
        };

        // Remove temporary password
        delete newAdminData.tempPassword;

        // Step 4: Set data to new document (UID-based)
        await setDoc(newDocRef, newAdminData, { merge: true });

        // Step 5: Delete old document
        await deleteDoc(oldDocRef);

        console.log("Admin document successfully renamed to UID-based ID without tempPassword.");
      } else {
        console.error("No document found for the given email ID.");
      }
      console.log("Admin document migrated to UID-based ID without tempPassword")

      // Step 4: Log the successful account creation
      await addDoc(collection(db, "admin_logs"), {
        action: "First login complete",
        performedBy: newUser.uid,
        performedByEmail: newUser.email,
        timestamp: serverTimestamp(),
        description: "Firebase Auth account created with new password.",
      })
      
      // Redirect to appropriate dashboard
      await checkUserRole(newUser.uid);
      isDuringFirstLoginSetup = false;

      console.log("First login setup completed successfully")

      // Hide modal
      passwordChangeModal.classList.remove("show")

      // Show success message
      alert("Account created successfully! Redirecting to dashboard...")


    } catch (firestoreError) {
      console.error("Error setting up Firestore data:", firestoreError)

      // If Firestore operations failed, clean up the auth account
      try {
        await newUser.delete()
        console.log("Cleaned up auth account after Firestore setup failure")
      } catch (cleanupError) {
        console.error("Error cleaning up auth account:", cleanupError)
      }

      throw new Error("Failed to complete account setup. Please try again.")
    }

  } catch (error) {
    console.error("Error completing first login setup:", error)
    throw error
  }
}

// Password strength validation
function isPasswordStrong(password) {
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)

  return hasUpperCase && hasLowerCase && hasNumbers
}

// Toggle password visibility
document.addEventListener("click", (e) => {
  if (e.target.closest(".toggle-password")) {
    const button = e.target.closest(".toggle-password")
    const targetId = button.getAttribute("data-target")
    const input = document.getElementById(targetId)
    const icon = button.querySelector("i")

    if (input.type === "password") {
      input.type = "text"
      icon.classList.remove("fa-eye")
      icon.classList.add("fa-eye-slash")
    } else {
      input.type = "password"
      icon.classList.remove("fa-eye-slash")
      icon.classList.add("fa-eye")
    }
  }
})

// Real-time password validation
newPasswordInput.addEventListener("input", (e) => {
  const password = e.target.value
  updatePasswordStrength(password)
})

function updatePasswordStrength(password) {
  const strengthIndicator = document.querySelector(".password-strength")

  if (!strengthIndicator) return

  let strength = 0

  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[a-z]/.test(password)) strength++
  if (/\d/.test(password)) strength++
  if (/[^A-Za-z0-9]/.test(password)) strength++

  strengthIndicator.className = "password-strength"

  if (strength < 3) {
    strengthIndicator.classList.add("weak")
  } else if (strength < 5) {
    strengthIndicator.classList.add("medium")
  } else {
    strengthIndicator.classList.add("strong")
  }
}

// Forgot password functionality (updated to handle first login case)
forgotPasswordLink.addEventListener("click", async (e) => {
  e.preventDefault()

  const email = emailInput.value.trim()

  if (!email) {
    errorMessage.textContent = "Please enter your email address first."
    return
  }

  try {
    // First check if this is a pending admin (first login not completed)
    let emailDocId = email.replace(/[.#$[\]]/g, "_")
    let pendingAdminRef = doc(db, "admins", emailDocId)
    let pendingAdminDoc = await getDoc(pendingAdminRef)

    // If document doesn't exist with sanitized email, try with dot replaced by underscore
    if (!pendingAdminDoc.exists) {
      emailDocId = email.replace(".com", "_com")
      pendingAdminRef = doc(db, "admins", emailDocId)
      pendingAdminDoc = await getDoc(pendingAdminRef)
    }

    if (pendingAdminDoc.exists() && pendingAdminDoc.data().firstLogin) {
      errorMessage.textContent = "Please complete your first login using the temporary password sent to your email."
      return
    }

    // Proceed with regular password reset for existing users
    await sendPasswordResetEmail(auth, email)
    errorMessage.textContent = ""
    alert(`Password reset email sent to ${email}`)
  } catch (error) {
    console.error("Password reset error:", error)
    errorMessage.textContent = "Failed to send password reset email. Please try again."
  }
})

// Check user role and redirect accordingly
async function checkUserRole(userId) {
  try {
      console.log("check role user ID:", userId)
    // Check if the user is in the admins collection
    
    let adminRef = doc(db, "admins", userId)
    let adminDoc = await getDoc(adminRef)

    if (adminDoc.exists) {
      const adminData = adminDoc.data()
      console.log("Admin data:", adminDoc.data())

      // Check if admin account is active
      if (!adminData.isActive) {
        errorMessage.textContent = "Your admin account has been blocked. Contact the Super Admin."

        // Sign out the user
        await signOut(auth)

        // Reset button
        document.querySelector(".login-btn").textContent = "LOGIN"
        document.querySelector(".login-btn").disabled = false
        return
      }

      // Log the login attempt
      logLoginActivity(userId, adminData.email, adminData.role)

      // Check role and redirect
      if (adminData.role === "Super Admin") {
        console.log("Redirecting to super admin dashboard")
        localStorage.setItem("userRole", "super_admin")
        window.location.href = "superAdmin/dashboard.html"
      } else if (adminData.role === "Admin") {
        console.log("Redirecting to admin dashboard")
        localStorage.setItem("userRole", "admin")
        window.location.href = "admin/dashboard.html"
      } else {
        // Default redirect for other roles
        console.log("Redirecting to default dashboard")
        localStorage.setItem("userRole", "user")
        window.location.href = "index.html"
      }
    } else {
      // User not found in admins collection
      console.log("User not found in admins collection")
      errorMessage.textContent = "Access denied. You do not have admin privileges."

      // Sign out the user
      await signOut(auth)

      // Reset button
      document.querySelector(".login-btn").textContent = "LOGIN"
      document.querySelector(".login-btn").disabled = false
    }
  } catch (error) {
    console.error("Error checking user role:", error)
    errorMessage.textContent = "Error verifying account type. Please try again."

    // Reset button
    document.querySelector(".login-btn").textContent = "LOGIN"
    document.querySelector(".login-btn").disabled = false
  }
}

// Log login activity to Firestore
function logLoginActivity(userId, email, role) {
  try {
    addDoc(collection(db, "login_logs"), {
      userId: userId,
      email: email,
      role: role,
      timestamp: serverTimestamp(),
      action: "Login",
      userAgent: navigator.userAgent,
    })
    console.log("Login activity logged")
  } catch (error) {
    console.error("Error logging login activity:", error)
  }
}

// Check if user is already logged in
// auth.onAuthStateChanged((user) => {
//   if (user && !isDuringFirstLoginSetup) {
//     // User is already signed in, check role and redirect
//     checkUserRole(user.uid)
//   }
// })

// Always run on login to check and sync email
auth.onAuthStateChanged(async (user) => {
  if (user && !isDuringFirstLoginSetup) {
    try {
      const adminRef = doc(db, "admins", user.uid);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        const firestoreEmail = adminSnap.data().email;
        if (firestoreEmail !== user.email) {
          await updateDoc(adminRef, { email: user.email });
          console.log(`[sync] Updated Firestore email: ${firestoreEmail} -> ${user.email}`);
        } else {
          console.log("[sync] Firestore email matches Auth email");
        }
      } else {
        console.warn("[sync] No admin doc found for UID:", user.uid);
      }
    } catch (err) {
      console.error("[sync] Error syncing Firestore email:", err);
    }

    // Continue to role check
    checkUserRole(user.uid);
  }
});



