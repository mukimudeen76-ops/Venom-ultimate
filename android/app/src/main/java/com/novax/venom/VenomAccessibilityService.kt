package com.novax.venom

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

class VenomAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "VenomAccessibility"
        private var instance: VenomAccessibilityService? = null

        fun getInstance(): VenomAccessibilityService? = instance

        fun performBackAction(): Boolean {
            return instance?.performGlobalAction(GLOBAL_ACTION_BACK) ?: false
        }

        fun performHomeAction(): Boolean {
            return instance?.performGlobalAction(GLOBAL_ACTION_HOME) ?: false
        }

        fun performRecentsAction(): Boolean {
            return instance?.performGlobalAction(GLOBAL_ACTION_RECENTS) ?: false
        }

        fun getScreenContextJson(): String {
            val service = instance ?: return JSONObject().put("error", "Accessibility service not active").toString()
            val rootNode = service.rootInActiveWindow ?: return JSONObject().put("packageName", "unknown").put("nodes", JSONArray()).toString()
            val json = JSONObject()
            json.put("packageName", rootNode.packageName?.toString() ?: "unknown")

            val nodesArray = JSONArray()
            traverseAndCollectNodes(rootNode, nodesArray, 0)
            json.put("nodes", nodesArray)
            return json.toString()
        }

        private fun traverseAndCollectNodes(node: AccessibilityNodeInfo, array: JSONArray, depth: Int) {
            if (depth > 12) return
            val text = node.text?.toString() ?: node.contentDescription?.toString() ?: ""
            if (text.isNotEmpty() || node.isClickable || node.isEditable) {
                val item = JSONObject()
                if (text.isNotEmpty()) item.put("text", text)
                item.put("className", node.className?.toString() ?: "")
                item.put("isClickable", node.isClickable)
                item.put("isEditable", node.isEditable)
                array.put(item)
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    traverseAndCollectNodes(child, array, depth + 1)
                    child.recycle()
                }
            }
        }

        fun typeTextInInput(textToType: String): Boolean {
            val root = instance?.rootInActiveWindow ?: return false
            val editableNode = findEditableNode(root)
            if (editableNode != null) {
                val arguments = Bundle()
                arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, textToType)
                val success = editableNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
                editableNode.recycle()
                return success
            }
            return false
        }

        private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
            if (node.isEditable || node.isFocused) return node
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                val res = findEditableNode(child)
                if (res != null) return res
            }
            return null
        }

        fun scrollBy(direction: String): Boolean {
            val service = instance ?: return false
            val root = service.rootInActiveWindow ?: return false
            return try {
                if (direction.equals("UP", ignoreCase = true)) {
                    root.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                } else {
                    root.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
                }
            } catch (e: Exception) {
                Log.e(TAG, "scrollBy error", e)
                false
            }
        }

        fun clickByText(targetText: String): Boolean {
            val root = instance?.rootInActiveWindow ?: return false
            val nodes = root.findAccessibilityNodeInfosByText(targetText)
            if (nodes != null && nodes.isNotEmpty()) {
                for (node in nodes) {
                    if (node.isClickable) {
                        return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    }
                    var parent = node.parent
                    while (parent != null) {
                        if (parent.isClickable) {
                            return parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        }
                        parent = parent.parent
                    }
                }
            }
            return false
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Venom Accessibility Service Connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Active node tree tracking
    }

    override fun onInterrupt() {
        Log.d(TAG, "Venom Accessibility Service Interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }
}
