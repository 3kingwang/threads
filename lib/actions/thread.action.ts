"use server"
import { connectToDB } from "../mongoose"
import User from "../models/user.model"
import Thread from "../models/thread.model"
import { revalidatePath } from "next/cache"

interface Params {
  text: string
  author: string
  communityId: string | null
  path: string
}
export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDB()
    const createdThread = await Thread.create({
      text,
      author,
      community: null,
    })
    //  Update user model
    await User.findByIdAndUpdate(author, {
      $push: {
        threads: createdThread._id,
      },
    })
    revalidatePath(path)
  } catch (error: any) {
    throw new Error(`Error creating thread: ${error.message}`)
  }
}
export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB()
  // calculate the number of posts to skip
  const skipAmount = (pageNumber - 1) * pageSize
  // fetch the posts that have no parents(top-level threads...)
  const postQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .populate({ path: "author", model: "User" })
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: "User",
        select: "_id name parentId image",
      },
    })
  const totalPostsCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  })
  const posts = await postQuery.exec()
  const isNext = totalPostsCount > skipAmount + posts.length
  return { posts, isNext }
}

export async function fetchThreadById(id: string) {
  connectToDB()
  try {
    // TODO: Polpulate community
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: "User",
        select: "_id name parentId image",
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: "User",
            select: "_id name parentId image",
          },
          {
            path: "children",
            model: "Thread",
            populate: {
              path: "author",
              model: "User",
              select: "_id name parentId image",
            },
          },
        ],
      })
      .exec()
    return thread
  } catch (error: any) {
    throw new Error(`Error fetching thread by id: ${error.message}`)
  }
}
export async function addCommentToThread(
  threadId: string,
  commentText: string,
  userId: string,
  path: string,
){
  connectToDB()
  try {
    // Find the original thread by its id
    const originalThread = await Thread.findById(threadId)
    if(!originalThread){
      throw new Error('Thread not found')
    }
    // create a new thread with the comment text
    const commentThread = new Thread({
      text:commentText,
      author: userId,
      parentId: threadId,
    })
    // save the comment thread
    const saveCommentThread = await commentThread.save()
    // Update the original thread to include the new comment
    originalThread.children.push(saveCommentThread._id)
    await originalThread.save()
    revalidatePath(path)
  } catch (error:any) {
    throw new Error(`Error adding comment to thread: ${error.message}`)
  }
}