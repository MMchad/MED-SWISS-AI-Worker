// handlers/users.js
import { createResponse, log } from '../utils/utils';


export async function checkQuota(userId, increment, env, requestId) {
    try {
        // Get user and plan info using userId
        const user = await env.DB
            .prepare(`
                SELECT users.*, plans.total_requests 
                FROM users 
                JOIN plans ON users.plan_id = plans.plan_id 
                WHERE users.id = ?
            `)
            .bind(userId)
            .first();

        if (!user) {
            throw new Error('User not found');
        }

        // Check if user has reached their quota
        if (user.used_requests + increment > user.total_requests) {
            throw new Error('Request quota exceeded');
        }

        // Increment used requests
        await env.DB
            .prepare('UPDATE users SET used_requests = used_requests + ? WHERE id = ?')
            .bind(increment, userId)
            .run();

        const usedRequests = user.used_requests + increment;
        const remainingRequests = user.total_requests - usedRequests;
        
        log(requestId, `Updated user quota`, {
            userId,
            usedRequests,
            totalRequests: user.total_requests,
            remainingRequests
        });

        return {
            success: true,
            usedRequests,
            totalRequests: user.total_requests,
            remainingRequests
        };
    } catch (error) {
        log(requestId, `Quota check error: ${error.message}`);
        throw error;
    }
}

export async function handleQuotaCheck(request, env, userId, requestId) {
    try {
        // Get user and plan info
        const user = await env.DB
            .prepare(`
                SELECT users.*, plans.total_requests 
                FROM users 
                JOIN plans ON users.plan_id = plans.plan_id 
                WHERE users.id = ?
            `)
            .bind(userId)
            .first();

        if (!user) {
            return createResponse(404, 'User not found');
        }

        const quota = {
            used: user.used_requests,
            total: user.total_requests,
            remaining: user.total_requests - user.used_requests,
            resetDate: user.reset_date
        };

        log(requestId, `Quota check for user ${userId}`, quota);

        return createResponse(200, null, { quota });
        
    } catch (error) {
        log(requestId, `Quota check error: ${error.message}`);
        return createResponse(500, error.message);
    }
}

export async function handleUserUpdate(request, env, requestId) {
    try {
        const { userId, email, planId, key } = await request.json();

        // Validate required fields
        if (!userId || !email || !planId || !key) {
            return createResponse(400, 'userId, email, planId, and key are required');
        }

        // Ensure userId and planId are numbers
        const userIdNum = parseInt(userId);
        const planIdNum = parseInt(planId);

        if (isNaN(userIdNum) || isNaN(planIdNum)) {
            return createResponse(400, 'userId and planId must be valid numbers');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return createResponse(400, 'Invalid email format');
        }

        // Validate API key
        if (key !== env.SUBSCRIPTION_API_KEY) {
            return createResponse(401, 'Invalid API key');
        }

        // Verify plan exists
        const plan = await env.DB
            .prepare('SELECT * FROM plans WHERE plan_id = ?')
            .bind(planIdNum)
            .first();

        if (!plan) {
            return createResponse(400, 'Invalid plan ID');
        }

        // Calculate next reset date (30 days from now)
        const now = new Date();
        const resetDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
        
        try {
            // Check if user exists using userId
            const existingUser = await env.DB
                .prepare('SELECT * FROM users WHERE id = ?')
                .bind(userIdNum)
                .first();

            if (existingUser) {
                // Update existing user's plan and email
                await env.DB
                    .prepare('UPDATE users SET plan_id = ?, email = ?, reset_date = ? WHERE id = ?')
                    .bind(planIdNum, email, resetDate.toISOString(), userIdNum)
                    .run();

                log(requestId, `Updated user plan and email`, {
                    userId: userIdNum,
                    email,
                    planId: planIdNum,
                    resetDate: resetDate.toISOString(),
                    previousPlan: existingUser.plan_id
                });
            } else {
                // Create new user with explicit values
                await env.DB
                    .prepare(`
                        INSERT INTO users (id, email, plan_id, used_requests, reset_date) 
                        VALUES (?, ?, ?, 0, ?)
                    `)
                    .bind(userIdNum, email, planIdNum, resetDate.toISOString())
                    .run();

                log(requestId, `Created new user`, {
                    userId: userIdNum,
                    email,
                    planId: planIdNum,
                    resetDate: resetDate.toISOString()
                });
            }

            // Get updated user info
            const updatedUser = await env.DB
                .prepare(`
                    SELECT users.*, plans.total_requests 
                    FROM users 
                    JOIN plans ON users.plan_id = plans.plan_id 
                    WHERE users.id = ?
                `)
                .bind(userIdNum)
                .first();

            if (!updatedUser) {
                throw new Error('Failed to retrieve updated user data');
            }

            return createResponse(200, null, {
                message: existingUser ? 'User updated' : 'User created',
                user: {
                    userId: updatedUser.user_id,
                    email: updatedUser.email,
                    planId: updatedUser.plan_id,
                    usedRequests: updatedUser.used_requests,
                    totalRequests: updatedUser.total_requests,
                    resetDate: updatedUser.reset_date
                }
            });

        } catch (dbError) {
            log(requestId, `Database operation failed: ${dbError.message}`);
            return createResponse(500, 'Database operation failed');
        }

    } catch (error) {
        log(requestId, `User update error: ${error.message}`);
        return createResponse(500, error.message);
    }
}