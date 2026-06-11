import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase.js";
import { authenticateToken } from "../auth.js";

const router = Router();

function sortParticipants(a, b) {
  return a < b ? [a, b] : [b, a];
}

router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: convos, error } = await supabase
      .from("conversations")
      .select(`
        id, participant1, participant2, last_message, last_message_at,
        users!conversations_participant1_fkey(id, username, avatar),
        users!conversations_participant2_fkey(id, username, avatar)
      `)
      .or(`participant1.eq.${userId},participant2.eq.${userId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) throw error;

    const result = (convos || []).map((c) => {
      const isP1 = c.participant1 === userId;
      const otherUser = isP1 ? c.users_conversations_participant2_fkey : c.users_conversations_participant1_fkey;
      return {
        id: otherUser.id,
        username: otherUser.username,
        avatar: otherUser.avatar,
        last_message: c.last_message,
        last_message_time: c.last_message_at,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${req.userId},receiver_id.eq.${req.params.userId}),and(sender_id.eq.${req.params.userId},receiver_id.eq.${req.userId})`)
      .order("created_at", { ascending: true });

    if (error) throw error;
    res.json(messages || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:userId", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const targetUserId = req.params.userId;
    if (req.userId === targetUserId) {
      return res.status(400).json({ error: "Cannot message yourself" });
    }

    const { data: receiver } = await supabase
      .from("users")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (!receiver) return res.status(404).json({ error: "User not found" });

    const [p1, p2] = sortParticipants(req.userId, targetUserId);
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("participant1", p1)
      .eq("participant2", p2)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("conversations")
        .update({ last_message: content.trim(), last_message_at: now })
        .eq("id", existing.id);
    } else {
      await supabase.from("conversations").insert({
        participant1: p1,
        participant2: p2,
        last_message: content.trim(),
        last_message_at: now,
      });
    }

    const id = uuidv4();
    const { error: insertError } = await supabase
      .from("messages")
      .insert({ id, sender_id: req.userId, receiver_id: targetUserId, content: content.trim() });

    if (insertError) throw insertError;

    const { data: message } = await supabase
      .from("messages")
      .select("*")
      .eq("id", id)
      .single();

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/item/:messageId", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Content is required" });
    }

    const { data: existing } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, created_at")
      .eq("id", req.params.messageId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Message not found" });
    if (existing.sender_id !== req.userId) return res.status(403).json({ error: "Cannot edit someone else's message" });

    await supabase
      .from("messages")
      .update({ content: content.trim() })
      .eq("id", req.params.messageId);

    const { data: message } = await supabase
      .from("messages")
      .select("*")
      .eq("id", req.params.messageId)
      .single();

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/item/:messageId", authenticateToken, async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from("messages")
      .select("id, sender_id")
      .eq("id", req.params.messageId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: "Message not found" });
    if (existing.sender_id !== req.userId) return res.status(403).json({ error: "Cannot delete someone else's message" });

    await supabase
      .from("messages")
      .delete()
      .eq("id", req.params.messageId);

    res.json({ message: "Message deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
