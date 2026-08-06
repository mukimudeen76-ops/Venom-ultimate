package com.novax.venom.auth

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.novax.venom.SettingsManager
import com.novax.venom.memory.VenomDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class AuthManager(private val context: Context) {
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
    private val credentialManager = CredentialManager.create(context)

    // Replace with your actual Web Client ID from Google Cloud Console
    private val WEB_CLIENT_ID = "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"

    val currentUser get() = auth.currentUser

    suspend fun signInWithGoogle(): Boolean {
        return try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(WEB_CLIENT_ID)
                .setAutoSelectEnabled(true)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            val result = credentialManager.getCredential(context, request)
            handleSignIn(result)
        } catch (e: GetCredentialException) {
            Log.e("AuthManager", "Google Sign-In failed", e)
            false
        } catch (e: Exception) {
            Log.e("AuthManager", "Unexpected error during sign in", e)
            false
        }
    }

    private suspend fun handleSignIn(result: GetCredentialResponse): Boolean {
        val credential = result.credential
        if (credential is GoogleIdTokenCredential) {
            val idToken = credential.idToken
            val firebaseCredential = GoogleAuthProvider.getCredential(idToken, null)
            return try {
                auth.signInWithCredential(firebaseCredential).await()
                true
            } catch (e: Exception) {
                Log.e("AuthManager", "Firebase Auth failed", e)
                false
            }
        }
        return false
    }

    suspend fun signOut() {
        val uid = auth.currentUser?.uid
        auth.signOut()
        
        // Clear local cache when user signs out
        if (uid != null) {
            withContext(Dispatchers.IO) {
                VenomDatabase.getDatabase(context).memoryDao().clearUserMemory(uid)
            }
        }
        
        // Clear local settings
        SettingsManager(context).setApiKey("")
    }
}
