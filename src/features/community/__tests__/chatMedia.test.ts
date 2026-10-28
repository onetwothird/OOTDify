import {
  CHAT_EMOJI,
  PHOTO_BODY,
  chatPhotoPath,
  chatPhotoRef,
  photoMessageBody,
  showsCaption,
} from "../chatMedia";

describe("chat photos", () => {
  it("keeps each photo in its conversation and sender's folder", () => {
    expect(chatPhotoPath("conv", "me", "file")).toBe("conv/me/file.jpg");
  });

  it("refs the private chat bucket, which the database check expects", () => {
    expect(chatPhotoRef("conv/me/file.jpg")).toBe("chat/conv/me/file.jpg");
  });

  it("uses a short Photo label when there is no caption", () => {
    expect(photoMessageBody("")).toBe(PHOTO_BODY);
    expect(photoMessageBody("   ")).toBe(PHOTO_BODY);
  });

  it("keeps a trimmed caption, capped at 500 characters", () => {
    expect(photoMessageBody("  look at this  ")).toBe("look at this");
    expect(photoMessageBody("x".repeat(600))).toHaveLength(500);
  });

  it("only shows a caption under the picture when someone wrote one", () => {
    expect(showsCaption(PHOTO_BODY)).toBe(false);
    expect(showsCaption("look at this")).toBe(true);
  });
});

describe("emoji tray", () => {
  it("has no duplicates and no blanks", () => {
    expect(new Set(CHAT_EMOJI).size).toBe(CHAT_EMOJI.length);
    expect(CHAT_EMOJI.every((e) => e.trim().length > 0)).toBe(true);
  });
});
