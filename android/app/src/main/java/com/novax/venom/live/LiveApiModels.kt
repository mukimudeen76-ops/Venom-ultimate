package com.novax.venom.live

import org.json.JSONObject

data class ToolCall(
    val name: String,
    val id: String,
    val args: JSONObject
)
