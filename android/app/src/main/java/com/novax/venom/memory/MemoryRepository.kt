package com.novax.venom.memory

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "memory_facts")
data class MemoryFact(
    @PrimaryKey val id: String,
    val userId: String,
    val fact: String,
    val timestamp: Long,
    val category: String = "general"
)

@Dao
interface MemoryDao {
    @Query("SELECT * FROM memory_facts WHERE userId = :userId ORDER BY timestamp DESC")
    fun getAllFacts(userId: String): Flow<List<MemoryFact>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFact(fact: MemoryFact)

    @Query("DELETE FROM memory_facts WHERE userId = :userId")
    suspend fun clearUserMemory(userId: String)
}

@Database(entities = [MemoryFact::class], version = 1, exportSchema = false)
abstract class VenomDatabase : RoomDatabase() {
    abstract fun memoryDao(): MemoryDao

    companion object {
        @Volatile
        private var INSTANCE: VenomDatabase? = null

        fun getDatabase(context: Context): VenomDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    VenomDatabase::class.java,
                    "venom_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
